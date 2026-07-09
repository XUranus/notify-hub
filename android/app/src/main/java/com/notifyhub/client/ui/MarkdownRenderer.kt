package com.notifyhub.client.ui

import android.text.method.LinkMovementMethod
import android.widget.TextView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.text.style.TextOverflow
import io.noties.markwon.Markwon
import io.noties.markwon.core.CorePlugin
import io.noties.markwon.core.MarkwonTheme
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.html.HtmlPlugin

/**
 * MarkdownText renders markdown using Markwon, with pipe tables handled by
 * Compose so column widths can stay compact and the table can scroll sideways.
 *
 * When maxLines is limited (preview mode), renders as plain Compose Text for
 * consistent sizing — Markwon's MetricAffectingSpan can cause inconsistent
 * text sizes that are hard to override.
 */
@Composable
fun MarkdownText(
    body: String,
    modifier: Modifier = Modifier,
    maxLines: Int = Int.MAX_VALUE,
) {
    val isPreview = maxLines < Int.MAX_VALUE

    if (isPreview) {
        // Preview mode: plain text with consistent Compose styling
        val stripped = remember(body) { stripMarkdownForPreview(body) }
        Text(
            text = stripped,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
            modifier = modifier
        )
        return
    }

    // Full rendering mode: use Markwon for rich markdown
    val blocks = remember(body) { splitMarkdownBlocks(body) }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        blocks.forEach { block ->
            when (block) {
                is MarkdownBlock.Markdown -> MarkwonText(
                    body = block.text,
                    modifier = Modifier.fillMaxWidth()
                )
                is MarkdownBlock.Table -> MarkdownTable(
                    table = block.table,
                    maxRows = 50
                )
            }
        }
    }
}

// Pre-compiled regexes for stripMarkdownForPreview (avoid per-render compilation)
private val RE_CODE_BLOCK = Regex("```[\\s\\S]*?```")
private val RE_INLINE_CODE = Regex("`([^`]+)`")
private val RE_BOLD = Regex("\\*\\*(.+?)\\*\\*")
private val RE_ITALIC_STAR = Regex("\\*(.+?)\\*")
private val RE_BOLD_UNDER = Regex("__(.+?)__")
private val RE_ITALIC_UNDER = Regex("_(.+?)_")
private val RE_STRIKE = Regex("~~(.+?)~~")
private val RE_HEADING = Regex("^#{1,6}\\s+", RegexOption.MULTILINE)
private val RE_BULLET = Regex("^\\s*[-*+]\\s+", RegexOption.MULTILINE)
private val RE_ORDERED = Regex("^\\s*\\d+\\.\\s+", RegexOption.MULTILINE)
private val RE_IMAGE = Regex("!\\[.*?]\\(.*?\\)")
private val RE_LINK = Regex("\\[([^]]+)]\\([^)]+\\)")
private val RE_HR = Regex("^---+$", RegexOption.MULTILINE)

/**
 * Strip markdown formatting for preview rendering.
 * Removes inline code backticks, bold/italic markers, and leading bullet markers.
 */
private fun stripMarkdownForPreview(body: String): String {
    return body
        .replace(RE_CODE_BLOCK, "[code]")
        .replace(RE_INLINE_CODE, "$1")
        .replace(RE_BOLD, "$1")
        .replace(RE_ITALIC_STAR, "$1")
        .replace(RE_BOLD_UNDER, "$1")
        .replace(RE_ITALIC_UNDER, "$1")
        .replace(RE_STRIKE, "$1")
        .replace(RE_HEADING, "")
        .replace(RE_BULLET, "• ")
        .replace(RE_ORDERED, "• ")
        .replace(RE_IMAGE, "[image]")
        .replace(RE_LINK, "$1")
        .replace(RE_HR, "—")
        .trim()
}

@Composable
private fun MarkwonText(
    body: String,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val textColor = MaterialTheme.colorScheme.onSurface.toArgb()

    val markwon = remember(context) {
        val density = context.resources.displayMetrics.density
        val fontScale = context.resources.configuration.fontScale
        // Markwon codeTextSize/codeBlockTextSize are in raw pixels.
        // Convert from sp (14sp) to px, respecting user font scale.
        val textSizePx = (14f * density * fontScale).toInt()
        Markwon.builder(context)
            .usePlugin(CorePlugin.create())
            .usePlugin(StrikethroughPlugin.create())
            .usePlugin(HtmlPlugin.create())
            .usePlugin(object : io.noties.markwon.AbstractMarkwonPlugin() {
                override fun configureTheme(builder: MarkwonTheme.Builder) {
                    // Heading multipliers all 1.0: notifications are short-form text,
                    // not documents — headings should not be visually larger than body.
                    // Bold styling is preserved via HeadingSpan's fakeBoldText.
                    builder.headingTextSizeMultipliers(floatArrayOf(1f, 1f, 1f, 1f, 1f, 1f))
                    builder.codeTextSize(textSizePx)
                    builder.codeBlockTextSize(textSizePx)
                }
            })
            .build()
    }

    val spanned = remember(markwon, body) {
        try {
            markwon.toMarkdown(body)
        } catch (_: Exception) {
            null
        }
    }

    AndroidView(
        factory = { ctx ->
            TextView(ctx).apply {
                movementMethod = LinkMovementMethod.getInstance()
                setLineSpacing(0f, 1.2f)
                textSize = 14f
            }
        },
        update = { textView ->
            textView.setTextColor(textColor)
            textView.text = spanned ?: body
        },
        modifier = modifier
    )
}

@Composable
private fun MarkdownTable(table: MarkdownTableBlock, maxRows: Int = 50) {
    val density = LocalDensity.current
    val colorScheme = MaterialTheme.colorScheme
    val borderColor = colorScheme.outline.copy(alpha = 0.55f)
    val headerColor = colorScheme.surfaceVariant.copy(alpha = 0.9f)
    val oddRowColor = colorScheme.surfaceVariant.copy(alpha = 0.18f)
    val evenRowColor = Color.Transparent
    val columnWidths = remember(table) { table.estimatedColumnWidths(density.density) }
    val scrollState = rememberScrollState()
    val displayRows = table.rows.take(maxRows)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(scrollState)
    ) {
        Column(
            modifier = Modifier.border(1.dp, borderColor)
        ) {
            TableRow(
                cells = table.header,
                columnWidths = columnWidths,
                background = headerColor,
                borderColor = borderColor,
                header = true
            )
            displayRows.forEachIndexed { index, row ->
                TableRow(
                    cells = row,
                    columnWidths = columnWidths,
                    background = if (index % 2 == 0) oddRowColor else evenRowColor,
                    borderColor = borderColor,
                    header = false
                )
            }
            if (table.rows.size > maxRows) {
                val totalWidth = columnWidths.fold(0.dp) { acc, dp -> acc + dp }
                TableRow(
                    cells = listOf("… ${table.rows.size - maxRows} more rows"),
                    columnWidths = listOf(totalWidth),
                    background = oddRowColor,
                    borderColor = borderColor,
                    header = false
                )
            }
        }
    }
}

@Composable
private fun TableRow(
    cells: List<String>,
    columnWidths: List<Dp>,
    background: Color,
    borderColor: Color,
    header: Boolean,
) {
    Row(modifier = Modifier.background(background)) {
        columnWidths.forEachIndexed { index, width ->
            Box(
                modifier = Modifier
                    .width(width)
                    .border(0.5.dp, borderColor)
                    .padding(horizontal = 10.dp, vertical = 8.dp)
            ) {
                Text(
                    text = cells.getOrElse(index) { "" },
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                    fontWeight = if (header) FontWeight.SemiBold else FontWeight.Normal,
                    fontFamily = if (cells.getOrElse(index) { "" }.isInlineCode()) FontFamily.Monospace else null
                )
            }
        }
    }
}

private sealed interface MarkdownBlock {
    data class Markdown(val text: String) : MarkdownBlock
    data class Table(val table: MarkdownTableBlock) : MarkdownBlock
}

private data class MarkdownTableBlock(
    val header: List<String>,
    val rows: List<List<String>>,
) {
    fun estimatedColumnWidths(density: Float): List<Dp> {
        val allRows = listOf(header) + rows
        val columnCount = header.size
        return List(columnCount) { column ->
            val longest = allRows.maxOfOrNull { row ->
                row.getOrElse(column) { "" }.estimatedDisplayWidth()
            } ?: 0
            val widthPx = (longest * 8.5f * density) + (28f * density)
            val widthDp = widthPx / density
            widthDp.coerceIn(64f, 220f).dp
        }
    }
}

private fun splitMarkdownBlocks(body: String): List<MarkdownBlock> {
    val lines = body.lines()
    val blocks = mutableListOf<MarkdownBlock>()
    val markdown = mutableListOf<String>()

    fun flushMarkdown() {
        val text = markdown.joinToString("\n").trim('\n')
        if (text.isNotBlank()) {
            blocks += MarkdownBlock.Markdown(text)
        }
        markdown.clear()
    }

    var index = 0
    while (index < lines.size) {
        val current = lines[index]
        val next = lines.getOrNull(index + 1)
        if (next != null && current.looksLikeTableRow() && next.looksLikeTableSeparator()) {
            val header = splitMarkdownTableRow(current)
            val rows = mutableListOf<List<String>>()
            index += 2

            while (index < lines.size && lines[index].looksLikeTableRow()) {
                val row = splitMarkdownTableRow(lines[index])
                if (row.size <= 1 || row.all { it.isBlank() }) break
                rows += row
                index += 1
            }

            val columnCount = maxOf(header.size, rows.maxOfOrNull { it.size } ?: 0)
            if (columnCount > 1) {
                flushMarkdown()
                blocks += MarkdownBlock.Table(
                    MarkdownTableBlock(
                        header = header.normalizedCells(columnCount),
                        rows = rows.map { it.normalizedCells(columnCount) }
                    )
                )
                continue
            }
        }

        markdown += current
        index += 1
    }

    flushMarkdown()
    return blocks
}

private fun String.looksLikeTableRow(): Boolean =
    splitMarkdownTableRow(this).size > 1

private fun String.looksLikeTableSeparator(): Boolean {
    val cells = splitMarkdownTableRow(this)
    return cells.size > 1 && cells.all { cell ->
        cell.trim().matches(Regex(":?-{3,}:?"))
    }
}

private fun splitMarkdownTableRow(line: String): List<String> {
    val trimmed = line.trim().trim('|')
    if (!trimmed.contains('|')) return listOf(trimmed.cleanTableCell())

    val cells = mutableListOf<String>()
    val current = StringBuilder()
    var escaped = false
    var inCode = false

    for (char in trimmed) {
        when {
            escaped -> {
                current.append(char)
                escaped = false
            }
            char == '\\' -> escaped = true
            char == '`' -> {
                inCode = !inCode
                current.append(char)
            }
            char == '|' && !inCode -> {
                cells += current.toString().cleanTableCell()
                current.clear()
            }
            else -> current.append(char)
        }
    }
    if (escaped) current.append('\\')
    cells += current.toString().cleanTableCell()
    return cells
}

private fun String.cleanTableCell(): String =
    trim().removeSurrounding("`")

private fun List<String>.normalizedCells(columnCount: Int): List<String> =
    List(columnCount) { index -> getOrElse(index) { "" } }

private fun String.estimatedDisplayWidth(): Int =
    sumOf { char ->
        when {
            char.code >= 0x2E80 -> 2
            char.isUpperCase() -> 2
            else -> 1
        }.toInt()
    }.coerceAtLeast(2)

private fun String.isInlineCode(): Boolean =
    startsWith("`") && endsWith("`") && length > 1
