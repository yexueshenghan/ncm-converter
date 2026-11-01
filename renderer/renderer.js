'use strict';

const el = (id) => document.getElementById(id);

const dropzone = el('dropzone');
const fileList = el('fileList');
const listSection = el('listSection');
const listCount = el('listCount');
const convertBtn = el('convertBtn');
const status = el('status');
const bar = el('bar');
const outPath = el('outPath');
const outReset = el('outReset');
const toast = el('toast');

const state = {
  files: [],
  outDir: null,
  busy: false,
};

let toastTimer = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function render() {
  fileList.innerHTML = '';
  state.files.forEach((file, index) => {
    const li = document.createElement('li');
    li.dataset.index = index;

    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = file.name;

    const sub = document.createElement('span');
    sub.className = 'file-sub';
    sub.textContent = file.detail || formatSize(file.size);

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = file.status || '待转换';
    if (file.ok === true) badge.classList.add('ok');
    if (file.ok === false) badge.classList.add('err');
    if (file.busy) badge.classList.add('work');

    li.append(name, sub, badge);
    if (file.ok === true && file.output) {
      li.style.cursor = 'pointer';
      li.title = '点击在访达中显示';
      li.addEventListener('click', () => window.ncm.reveal(file.output));
    }
    fileList.appendChild(li);
  });

  listSection.hidden = state.files.length === 0;
  dropzone.classList.toggle('compact', state.files.length > 0);
  listCount.textContent = `${state.files.length} 个文件`;
  convertBtn.disabled = state.files.length === 0 || state.busy;
  convertBtn.textContent = state.busy ? '转换中…' : '开始转换';
}

async function addPaths(paths) {
  if (!paths || paths.length === 0) return;
  const found = await window.ncm.expand(paths);
  const known = new Set(state.files.map((f) => f.path));
  let added = 0;
  for (const filePath of found) {
    if (known.has(filePath)) continue;
    const name = filePath.split(/[\\/]/).pop();
    state.files.push({ path: filePath, name, status: '待转换' });
    known.add(filePath);
    added++;
  }
  if (found.length === 0) {
    showToast('没有找到 .ncm 文件');
    return;
  }
  if (added === 0) showToast('这些文件已经在列表里了');
  status.textContent = `已添加 ${state.files.length} 个文件`;
  render();
}

el('pickBtn').addEventListener('click', async () => {
  const paths = await window.ncm.pickFiles();
  addPaths(paths);
});

el('clearBtn').addEventListener('click', () => {
  if (state.busy) return;
  state.files = [];
  bar.style.width = '0';
  status.textContent = '等待添加文件';
  render();
});

el('outBtn').addEventListener('click', async () => {
  const dir = await window.ncm.pickFolder();
  if (!dir) return;
  state.outDir = dir;
  outPath.textContent = dir;
  outPath.title = dir;
  outReset.hidden = false;
});

outReset.addEventListener('click', () => {
  state.outDir = null;
  outPath.textContent = '与原文件相同文件夹';
  outPath.title = '';
  outReset.hidden = true;
});

convertBtn.addEventListener('click', async () => {
  if (state.busy || state.files.length === 0) return;
  state.busy = true;
  state.files.forEach((file) => {
    file.status = '待转换';
    file.ok = undefined;
    file.busy = false;
    file.output = null;
  });
  render();

  const unsubscribe = window.ncm.onProgress(({ index, total, file }) => {
    state.files.forEach((item, i) => {
      item.busy = i === index;
      if (i === index) item.status = '转换中';
      else if (i < index && !item.status.startsWith('成功') && !item.status.startsWith('失败')) {
        item.status = '待转换';
      }
    });
    bar.style.width = `${(index / total) * 100}%`;
    status.textContent = `正在转换 ${index + 1}/${total}：${file}`;
    render();
  });

  let payload = { cancelled: false, results: [] };
  try {
    payload = await window.ncm.convert({
      files: state.files.map((f) => f.path),
      outDir: state.outDir,
    });
  } finally {
    unsubscribe();
  }

  if (payload.cancelled) {
    state.files.forEach((file) => {
      file.busy = false;
      file.status = '待转换';
    });
    bar.style.width = '0';
    status.textContent = '已取消';
    state.busy = false;
    render();
    return;
  }

  const results = payload.results;
  results.forEach((result, i) => {
    const file = state.files[i];
    if (!file) return;
    file.busy = false;
    if (result.ok) {
      file.ok = true;
      file.status = `成功 · ${result.format.toUpperCase()}`;
      file.output = result.output;
      const bits = [result.artist, formatDuration(result.duration), formatSize(result.size)];
      file.detail = bits.filter(Boolean).join(' · ');
    } else {
      file.ok = false;
      file.status = '失败';
      file.detail = result.error;
      file.title = result.error;
    }
  });

  const okCount = results.filter((r) => r.ok).length;
  bar.style.width = '100%';
  status.textContent = `完成：成功 ${okCount} 个，失败 ${results.length - okCount} 个`;
  state.busy = false;
  render();
  showToast(okCount === results.length ? '全部转换完成' : '部分文件转换失败，把鼠标悬停在失败项上可看原因');
});

window.addEventListener('dragover', (event) => {
  event.preventDefault();
  document.body.classList.add('dragging');
  dropzone.classList.add('hot');
});

window.addEventListener('dragleave', (event) => {
  if (event.relatedTarget) return;
  document.body.classList.remove('dragging');
  dropzone.classList.remove('hot');
});

window.addEventListener('drop', async (event) => {
  event.preventDefault();
  document.body.classList.remove('dragging');
  dropzone.classList.remove('hot');
  const paths = Array.from(event.dataTransfer.files)
    .map((file) => window.ncm.pathForFile(file))
    .filter(Boolean);
  addPaths(paths);
});

render();

// 调试用：供主进程注入文件列表，截图检查界面
window.__addPaths = addPaths;
