import AppKit

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon-master.png"
let px = 1024

let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: px,
    pixelsHigh: px,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
)!

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext
ctx.setShouldAntialias(true)

let inset: CGFloat = 62
let side = CGFloat(px) - inset * 2
let box = NSRect(x: inset, y: inset, width: side, height: side)
let rounded = NSBezierPath(roundedRect: box, xRadius: 212, yRadius: 212)

ctx.saveGState()
rounded.addClip()
let gradient = NSGradient(colors: [
    NSColor(srgbRed: 1.00, green: 0.33, blue: 0.44, alpha: 1),
    NSColor(srgbRed: 1.00, green: 0.63, blue: 0.40, alpha: 1),
])!
gradient.draw(in: box, angle: -60)

// 顶部高光
let glow = NSGradient(colors: [
    NSColor(white: 1, alpha: 0.30),
    NSColor(white: 1, alpha: 0.0),
])!
glow.draw(in: NSRect(x: inset, y: CGFloat(px) * 0.55, width: side, height: side * 0.45), angle: -90)
ctx.restoreGState()

// 白色音符
let shadow = NSShadow()
shadow.shadowColor = NSColor(white: 0.25, alpha: 0.35)
shadow.shadowBlurRadius = 34
shadow.shadowOffset = NSSize(width: 0, height: -14)
shadow.set()

let white = NSColor.white
white.setFill()

NSBezierPath(ovalIn: NSRect(x: 258, y: 205, width: 214, height: 168)).fill()
NSBezierPath(ovalIn: NSRect(x: 596, y: 262, width: 214, height: 168)).fill()
NSBezierPath(rect: NSRect(x: 438, y: 330, width: 36, height: 392)).fill()
NSBezierPath(rect: NSRect(x: 776, y: 387, width: 36, height: 392)).fill()

let beam = NSBezierPath()
beam.move(to: NSPoint(x: 438, y: 722))
beam.line(to: NSPoint(x: 812, y: 779))
beam.line(to: NSPoint(x: 812, y: 678))
beam.line(to: NSPoint(x: 438, y: 621))
beam.close()
beam.fill()

// 内描边
NSColor(white: 1, alpha: 0.22).setStroke()
let border = NSBezierPath(roundedRect: box.insetBy(dx: 2, dy: 2), xRadius: 210, yRadius: 210)
border.lineWidth = 4
border.stroke()

NSGraphicsContext.restoreGraphicsState()

let data = rep.representation(using: .png, properties: [:])!
try data.write(to: URL(fileURLWithPath: out))
print("wrote \(out)")
