package com.notifyhub.client.ui

import android.text.method.LinkMovementMethod
import android.widget.HorizontalScrollView
import android.widget.TextView
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.viewinterop.AndroidView
import io.noties.markwon.Markwon
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.ext.tables.TablePlugin
import io.noties.markwon.html.HtmlPlugin
import io.noties.markwon.core.CorePlugin

/**
 * MarkdownText — renders markdown using Markwon.
 * Uses theme's onSurface color automatically.
 * Supports: headings, bold, italic, strikethrough, code blocks, inline code,
 * tables, links (clickable), blockquotes, lists, HTML.
 */
@Composable
fun MarkdownText(
    body: String,
    modifier: Modifier = Modifier,
    maxLines: Int = Int.MAX_VALUE,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val textColor = MaterialTheme.colorScheme.onSurface.toArgb()

    val markwon = remember {
        Markwon.builder(context)
            .usePlugin(CorePlugin.create())
            .usePlugin(StrikethroughPlugin.create())
            .usePlugin(TablePlugin.create(context))
            .usePlugin(HtmlPlugin.create())
            .build()
    }

    val spanned = remember(body) { markwon.toMarkdown(body) }

    AndroidView(
        factory = { ctx ->
            val scrollView = HorizontalScrollView(ctx).apply {
                isHorizontalScrollBarEnabled = false
                overScrollMode = HorizontalScrollView.OVER_SCROLL_NEVER
            }
            val textView = TextView(ctx).apply {
                movementMethod = LinkMovementMethod.getInstance()
                setTextIsSelectable(true)
                setLineSpacing(0f, 1.2f)
                textSize = 14f
            }
            scrollView.addView(textView)
            scrollView
        },
        update = { scrollView ->
            val textView = scrollView.getChildAt(0) as? TextView ?: return@AndroidView
            textView.setTextColor(textColor)
            textView.text = spanned
            if (maxLines < Int.MAX_VALUE) textView.maxLines = maxLines
        },
        modifier = modifier
    )
}
