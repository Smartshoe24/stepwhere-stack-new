package expo.modules.stepwherethemetransition

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import kotlin.math.hypot

class StepwhereThemeTransitionOverlayView @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null
) : View(context, attrs) {
  private val bitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    isFilterBitmap = true
    isDither = true
  }
  private val clearPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.TRANSPARENT
    xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
  }
  private var overlayAnimator: ValueAnimator? = null
  private var overlayColor: Int = Color.TRANSPARENT
  private var revealCenterX = 0f
  private var revealCenterY = 0f
  private var revealRadius = 0f
  private var snapshotBitmap: Bitmap? = null

  init {
    isClickable = true
    isFocusable = true
    setWillNotDraw(false)
    setLayerType(LAYER_TYPE_SOFTWARE, null)
  }

  fun setOverlayColor(color: Int) {
    overlayColor = color
    invalidate()
  }

  fun setRevealCenter(cx: Float, cy: Float) {
    revealCenterX = cx
    revealCenterY = cy
    invalidate()
  }

  fun setSnapshot(bitmap: Bitmap) {
    snapshotBitmap = bitmap
    invalidate()
  }

  fun cancelAnimation() {
    overlayAnimator?.cancel()
    overlayAnimator = null
  }

  fun release() {
    cancelAnimation()
    snapshotBitmap = null
    invalidate()
  }

  fun startReveal(durationMs: Long, onFinished: () -> Unit) {
    cancelAnimation()

    val widthF = width.toFloat()
    val heightF = height.toFloat()
    val maxRadius = maxOf(
      hypot(revealCenterX, revealCenterY),
      hypot(widthF - revealCenterX, revealCenterY),
      hypot(revealCenterX, heightF - revealCenterY),
      hypot(widthF - revealCenterX, heightF - revealCenterY),
    ) + 12f

    overlayAnimator = ValueAnimator.ofFloat(0f, maxRadius).apply {
      duration = durationMs
      interpolator = android.view.animation.AccelerateDecelerateInterpolator()
      addUpdateListener { animator ->
        revealRadius = animator.animatedValue as Float
        invalidate()
      }
      addListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) {
          overlayAnimator = null
          onFinished()
        }

        override fun onAnimationCancel(animation: Animator) {
          overlayAnimator = null
        }
      })
      start()
    }
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)

    val bitmap = snapshotBitmap ?: run {
      canvas.drawColor(overlayColor)
      return
    }

    val checkpoint = canvas.saveLayer(0f, 0f, width.toFloat(), height.toFloat(), null)
    canvas.drawColor(overlayColor)
    canvas.drawBitmap(bitmap, null, Rect(0, 0, width, height), bitmapPaint)
    canvas.drawCircle(revealCenterX, revealCenterY, revealRadius, clearPaint)
    canvas.restoreToCount(checkpoint)
  }

  override fun onTouchEvent(event: MotionEvent?): Boolean = true
}
