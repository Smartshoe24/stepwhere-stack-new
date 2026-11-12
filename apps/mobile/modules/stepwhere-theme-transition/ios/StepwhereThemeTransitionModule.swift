import ExpoModulesCore
import UIKit

public final class StepwhereThemeTransitionModule: Module {
  private weak var overlayView: StepwhereThemeTransitionOverlayView?

  public func definition() -> ModuleDefinition {
    Name("StepwhereThemeTransition")

    AsyncFunction("prepare") { (cx: Double, cy: Double, overlayColor: String?, promise: Promise) in
      DispatchQueue.main.async {
        guard let window = self.resolveWindow() else {
          promise.reject("ERR_THEME_TRANSITION_WINDOW", "Could not resolve a key window.")
          return
        }

        self.removeOverlay()

        guard let snapshotView = window.snapshotView(afterScreenUpdates: false) ?? self.makeSnapshotImageView(window: window) else {
          promise.reject("ERR_THEME_TRANSITION_CAPTURE", "Failed to capture the current screen.")
          return
        }

        let overlay = StepwhereThemeTransitionOverlayView(
          frame: window.bounds,
          origin: CGPoint(x: cx, y: cy),
          overlayColor: self.parseColor(overlayColor),
          snapshotView: snapshotView
        )
        window.addSubview(overlay)
        self.overlayView = overlay
        promise.resolve(nil)
      }
    }.runOnQueue(.main)

    AsyncFunction("commit") { (durationMs: Int, promise: Promise) in
      DispatchQueue.main.async {
        guard let overlay = self.overlayView else {
          promise.reject("ERR_THEME_TRANSITION_OVERLAY", "No prepared overlay is available.")
          return
        }

        overlay.startReveal(duration: TimeInterval(durationMs) / 1000.0) {
          self.removeOverlay()
          promise.resolve(nil)
        }
      }
    }.runOnQueue(.main)

    AsyncFunction("cancel") {
      DispatchQueue.main.async {
        self.removeOverlay()
      }
    }.runOnQueue(.main)

    OnAppEntersBackground {
      self.removeOverlay()
    }

    OnDestroy {
      self.removeOverlay()
    }
  }

  private func resolveWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first(where: \.isKeyWindow) ?? UIApplication.shared.delegate?.window??.rootViewController?.view.window
  }

  private func makeSnapshotImageView(window: UIWindow) -> UIImageView? {
    let renderer = UIGraphicsImageRenderer(bounds: window.bounds)
    let image = renderer.image { _ in
      window.drawHierarchy(in: window.bounds, afterScreenUpdates: false)
    }
    return UIImageView(image: image)
  }

  private func parseColor(_ color: String?) -> UIColor {
    guard
      let color,
      !color.isEmpty,
      let parsedColor = UIColor(hexString: color)
    else {
      return .clear
    }

    return parsedColor
  }

  private func removeOverlay() {
    overlayView?.layer.removeAllAnimations()
    overlayView?.removeFromSuperview()
    overlayView = nil
  }
}

private extension UIColor {
  convenience init?(hexString: String) {
    var value = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.hasPrefix("#") {
      value.removeFirst()
    }

    guard value.count == 6 || value.count == 8 else {
      return nil
    }

    var raw: UInt64 = 0
    guard Scanner(string: value).scanHexInt64(&raw) else {
      return nil
    }

    let hasAlpha = value.count == 8
    let alpha = CGFloat(hasAlpha ? (raw & 0xFF) : 0xFF) / 255.0
    let red = CGFloat((raw >> (hasAlpha ? 24 : 16)) & 0xFF) / 255.0
    let green = CGFloat((raw >> (hasAlpha ? 16 : 8)) & 0xFF) / 255.0
    let blue = CGFloat((raw >> (hasAlpha ? 8 : 0)) & 0xFF) / 255.0

    self.init(red: red, green: green, blue: blue, alpha: alpha)
  }
}
