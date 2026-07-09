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
import io.noties.markwon.Markwon
import io.noties.markwon.core.CorePlugin
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.html.HtmlPlugin

/**
 * MarkdownText renders markdown using Markwon, with pipe tables handled by
 * Compose so column widths can stay compact and the table can scroll sideways.
 */
@Composable
fun MarkdownText(
    body: String,
    modifier: Modifier = Modifier,
    maxLines: Int = Int.MAX_VALUE,
) {
    val blocks = remember(body) { splitMarkdownBlocks(body) }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        blocks.forEach { block ->
            when (block) {
                is MarkdownBlock.Markdown -> MarkwonText(
                    body = block.text,
                    maxLines = maxLines,
                    modifier = Modifier.fillMaxWidth()
                )
                is MarkdownBlock.Table -> MarkdownTable(
                    table = block.table,
                    maxRows = if (maxLines < Int.MAX_VALUE) maxLines else 50
                )
            }
        }
    }
}

@Composable
private fun MarkwonText(
    body: String,
    modifier: Modifier = Modifier,
    maxLines: Int = Int.MAX_VALUE,
) {
    val context = LocalContext.current
    val textColor = MaterialTheme.colorScheme.onSurface.toArgb()

    val markwon = remember(context) {
        Markwon.builder(context)
            .usePlugin(CorePlugin.create())
            .usePlugin(StrikethroughPlugin.create())
            .usePlugin(HtmlPlugin.create())
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
            textView.maxLines = maxLines
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
