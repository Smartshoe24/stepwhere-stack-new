import UIKit

final class StepwhereThemeTransitionOverlayView: UIView {
  private let snapshotContainer = UIView()
  private let snapshotBackingView = UIView()
  private let maskLayer = CAShapeLayer()
  private let origin: CGPoint

  init(frame: CGRect, origin: CGPoint, overlayColor: UIColor, snapshotView: UIView) {
    self.origin = origin
    super.init(frame: frame)

    backgroundColor = .clear
    isOpaque = false
    isUserInteractionEnabled = true
    autoresizingMask = [.flexibleWidth, .flexibleHeight]

    snapshotContainer.frame = bounds
    snapshotContainer.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    snapshotBackingView.frame = snapshotContainer.bounds
    snapshotBackingView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    snapshotBackingView.backgroundColor = overlayColor
    snapshotContainer.addSubview(snapshotBackingView)
    snapshotView.frame = snapshotContainer.bounds
    snapshotView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    snapshotContainer.addSubview(snapshotView)
    addSubview(snapshotContainer)

    maskLayer.frame = snapshotContainer.bounds
    maskLayer.fillRule = .evenOdd
    snapshotContainer.layer.mask = maskLayer
    updateMask(radius: 0)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    snapshotContainer.frame = bounds
    snapshotBackingView.frame = snapshotContainer.bounds
    maskLayer.frame = snapshotContainer.bounds
  }

  func startReveal(duration: TimeInterval, completion: @escaping () -> Void) {
    let startPath = makeMaskPath(radius: 0)
    let endPath = makeMaskPath(radius: maxRadius())
    maskLayer.path = endPath.cgPath

    let animation = CABasicAnimation(keyPath: "path")
    animation.fromValue = startPath.cgPath
    animation.toValue = endPath.cgPath
    animation.duration = duration
    animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    CATransaction.begin()
    CATransaction.setCompletionBlock(completion)
    maskLayer.add(animation, forKey: "stepwhereThemeReveal")
    CATransaction.commit()
  }

  private func updateMask(radius: CGFloat) {
    maskLayer.path = makeMaskPath(radius: radius).cgPath
  }

  private func maxRadius() -> CGFloat {
    let corners = [
      CGPoint(x: 0, y: 0),
      CGPoint(x: bounds.width, y: 0),
      CGPoint(x: 0, y: bounds.height),
      CGPoint(x: bounds.width, y: bounds.height)
    ]

    return corners
      .map { hypot($0.x - origin.x, $0.y - origin.y) }
      .max() ?? 0
  }

  private func makeMaskPath(radius: CGFloat) -> UIBezierPath {
    let path = UIBezierPath(rect: bounds)
    let circlePath = UIBezierPath(
      arcCenter: origin,
      radius: radius,
      startAngle: 0,
      endAngle: CGFloat.pi * 2,
      clockwise: true
    )
    path.append(circlePath)
    path.usesEvenOddFillRule = true
    return path
  }
}
