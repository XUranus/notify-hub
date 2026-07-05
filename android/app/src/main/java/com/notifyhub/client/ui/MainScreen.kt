package com.notifyhub.client.ui

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.SelectAll
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Badge
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.notifyhub.client.data.ConfigStore
import com.notifyhub.client.data.I18n
import com.notifyhub.client.data.LocalMessage
import com.notifyhub.client.data.MessageFilter
import com.notifyhub.client.data.MessageStore
import com.notifyhub.client.data.ClientConfig
import com.notifyhub.client.service.PollService
import java.text.SimpleDateFormat
import java.util.Locale
import androidx.compose.foundation.Image
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import coil.request.ImageRequest
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.ViewList
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Notifications

// ── Topic Grouping ──
private data class TopicGroup(
    val key: String,
    val topicId: String?,
    val topicName: String?,
    val topicDisplayName: String?,
    val topicIcon: String?,
    val messages: List<LocalMessage>,
)

private fun groupByTopic(messages: List<LocalMessage>): List<TopicGroup> {
    val groups = mutableMapOf<String, MutableList<LocalMessage>>()
    for (m in messages) {
        val key = m.topicId ?: "__no_topic__"
        groups.getOrPut(key) { mutableListOf() }.add(m)
    }
    return groups.entries.map { (key, msgs) ->
        val first = msgs.first()
        TopicGroup(
            key = key,
            topicId = first.topicId,
            topicName = first.topicName,
            topicDisplayName = first.topicDisplayName,
            topicIcon = first.topicIcon,
            messages = msgs.sortedByDescending { it.receivedAt },
        )
    }.sortedWith(compareByDescending<TopicGroup> { it.topicId != null }.thenByDescending { it.messages.firstOrNull()?.receivedAt ?: "" })
}

@Composable
private fun TopicAvatar(
    topicIcon: String?,
    topicName: String?,
    topicDisplayName: String?,
    size: Int = 40,
    borderColor: Color = MaterialTheme.colorScheme.primary,
) {
    val label = topicDisplayName ?: topicName
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(borderColor.copy(alpha = 0.12f)),
        contentAlignment = Alignment.Center
    ) {
        when {
            !topicIcon.isNullOrEmpty() -> {
                if (topicIcon.startsWith("data:")) {
                    // Base64 data URI
                    val bitmap = remember(topicIcon) {
                        try {
                            val base64 = topicIcon.substringAfter(",")
                            val bytes = Base64.decode(base64, Base64.DEFAULT)
                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
                        } catch (_: Exception) { null }
                    }
                    if (bitmap != null) {
                        Image(
                            bitmap = bitmap,
                            contentDescription = null,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop,
                        )
                    }
                } else {
                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current).data(topicIcon).crossfade(true).build(),
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                    )
                }
            }
            !label.isNullOrEmpty() -> {
                val initials = if (label.length <= 2) label else label.substring(0, 2)
                Text(initials, fontSize = (size * 0.35).sp, fontWeight = FontWeight.Bold, color = borderColor)
            }
            else -> {
                Icon(
                    Icons.Default.Notifications,
                    contentDescription = null,
                    modifier = Modifier.size((size * 0.5).dp),
                    tint = borderColor.copy(alpha = 0.6f)
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun MainScreen(
    config: ClientConfig,
    pollService: PollService?,
    onOpenSettings: () -> Unit,
    onCompose: () -> Unit = {},
    openMessageId: String? = null,
    onMessageOpened: () -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val i18n = { key: String -> I18n[key] }

    // Reactive state from Room (auto-updates on DB changes)
    val allMessages by MessageStore.getAllFlow(context).collectAsState(initial = emptyList())
    val unreadCount by MessageStore.getUnreadCountFlow(context).collectAsState(initial = 0)

    var showSearch by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }

    // Filter state
    var currentFilter by remember { mutableStateOf(MessageFilter.ALL) }
    var showFilterMenu by remember { mutableStateOf(false) }

    // Selection mode state
    var selectionMode by remember { mutableStateOf(false) }
    val selectedIds = remember { mutableStateListOf<String>() }
    var showDeleteConfirm by remember { mutableStateOf(false) }

    // Range selection state (long-press + drag)
    var rangeSelectStartId by remember { mutableStateOf<String?>(null) }
    var rangeSelectStartY by remember { mutableStateOf(0f) }
    var rangeSelectPrevId by remember { mutableStateOf<String?>(null) }
    val listState = remember { androidx.compose.foundation.lazy.LazyListState(0, 0) }
    var listTopPx by remember { mutableStateOf(0f) }

    // Detail screen state
    var selectedMessage by remember { mutableStateOf<LocalMessage?>(null) }

    // Handle notification click — open message detail or show deleted toast
    LaunchedEffect(openMessageId) {
        if (openMessageId != null) {
            val msg = withContext(Dispatchers.IO) { MessageStore.getById(context, openMessageId) }
            if (msg != null) {
                selectedMessage = msg
            } else {
                Toast.makeText(context, I18n["msg_deleted"], Toast.LENGTH_SHORT).show()
            }
            onMessageOpened()
        }
    }

    // Topic view state
    var viewMode by remember { mutableStateOf(ConfigStore.getViewMode(context)) }
    var topicDetailKey by remember { mutableStateOf<String?>(null) }

    // Snackbar state for undo
    val snackbarHostState = remember { SnackbarHostState() }
    var lastDeletedMessage by remember { mutableStateOf<LocalMessage?>(null) }
    var lastDeletedIndex by remember { mutableStateOf(0) }

    val isConnected = pollService?.isConnected?.value == true
    val isOfflineMode = pollService?.isOfflineMode?.value == true
    val lastError = pollService?.lastError?.value
    val hasError = !isConnected && !isOfflineMode && lastError != null
    var isMuted by remember { mutableStateOf(ConfigStore.isMuted(context)) }

    // Refresh mute state periodically
    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(30_000)
            isMuted = ConfigStore.isMuted(context)
        }
    }

    // Auto-clean: run on startup, then every 12 hours
    LaunchedEffect(Unit) {
        val twelveHours = 12 * 3600_000L
        while (true) {
            val days = ConfigStore.getAutoCleanDays(context)
            if (days > 0) MessageStore.cleanOldMessages(context, days)
            kotlinx.coroutines.delay(twelveHours)
        }
    }

    // In-memory filter/search (fast for 10k+ items)
    val filtered by remember {
        derivedStateOf {
            allMessages.filter { msg ->
                val matchesSearch = searchQuery.isBlank() ||
                    msg.title.contains(searchQuery, ignoreCase = true) ||
                    msg.body.contains(searchQuery, ignoreCase = true)
                val matchesFilter = when (currentFilter) {
                    MessageFilter.ALL -> true
                    MessageFilter.UNREAD -> !msg.read
                    MessageFilter.READ -> msg.read
                    MessageFilter.FLAGGED -> msg.flagged
                }
                matchesSearch && matchesFilter
            }
        }
    }

    fun exitSelectionMode() {
        selectionMode = false
        selectedIds.clear()
        rangeSelectStartId = null
        rangeSelectPrevId = null
    }

    fun selectRange(list: List<LocalMessage>, fromId: String, toId: String) {
        val fromIdx = list.indexOfFirst { it.id == fromId }
        val toIdx = list.indexOfFirst { it.id == toId }
        if (fromIdx < 0 || toIdx < 0) return
        val (start, end) = if (fromIdx <= toIdx) fromIdx to toIdx else toIdx to fromIdx
        val rangeIds = (start..end).map { list[it].id }.toSet()
        selectedIds.clear()
        selectedIds.addAll(rangeIds)
    }

    // Show snackbar when message is deleted
    LaunchedEffect(lastDeletedMessage) {
        lastDeletedMessage?.let { deleted ->
            val result = snackbarHostState.showSnackbar(
                message = I18n["msg_deleted"],
                actionLabel = I18n["undo"],
                duration = SnackbarDuration.Short
            )
            if (result == SnackbarResult.ActionPerformed) {
                scope.launch { MessageStore.insert(context, deleted, lastDeletedIndex) }
            }
            lastDeletedMessage = null
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        floatingActionButton = {
            if (!selectionMode) {
                FloatingActionButton(
                    onClick = onCompose,
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                    shape = CircleShape,
                ) {
                    Icon(Icons.Default.Add, contentDescription = i18n("compose_title"))
                }
            }
        },
        topBar = {
            TopAppBar(
                title = {
                    if (selectionMode) {
                        Text("${selectedIds.size} ${i18n("selected")}", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(i18n("tab_messages"), fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                            if (unreadCount > 0) {
                                Spacer(Modifier.width(6.dp))
                                Badge { Text(unreadCount.toString()) }
                            }
                            Spacer(Modifier.width(12.dp))
                            if (isOfflineMode) {
                                Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(MaterialTheme.colorScheme.error))
                                Spacer(Modifier.width(4.dp))
                                Text(i18n("status_offline"), fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                            } else if (isConnected) {
                                Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
                                Spacer(Modifier.width(4.dp))
                                Text(i18n("status_connected"), fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
                            } else if (hasError) {
                                Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(MaterialTheme.colorScheme.error))
                                Spacer(Modifier.width(4.dp))
                                Text(i18n("status_error"), fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                            } else {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(14.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(i18n("status_connecting"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            if (isMuted) {
                                Spacer(Modifier.width(8.dp))
                                Icon(
                                    Icons.Default.VolumeOff,
                                    contentDescription = i18n("muted"),
                                    modifier = Modifier.size(16.dp),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                },
                actions = {
                    if (selectionMode) {
                        IconButton(onClick = {
                            if (selectedIds.size == filtered.size) {
                                selectedIds.clear()
                            } else {
                                selectedIds.clear()
                                selectedIds.addAll(filtered.map { it.id })
                            }
                        }) {
                            val allSelected = selectedIds.size == filtered.size && filtered.isNotEmpty()
                            Icon(
                                Icons.Default.SelectAll,
                                contentDescription = i18n("select_all"),
                                tint = if (allSelected) MaterialTheme.colorScheme.primary
                                       else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        IconButton(onClick = { showDeleteConfirm = true }) {
                            Icon(Icons.Default.Delete, contentDescription = i18n("delete"), tint = MaterialTheme.colorScheme.error)
                        }
                        IconButton(onClick = { exitSelectionMode() }) {
                            Icon(Icons.Default.Close, contentDescription = i18n("cancel"))
                        }
                    } else {
                        IconButton(onClick = { showSearch = !showSearch }) {
                            Icon(Icons.Default.Search, contentDescription = i18n("search"))
                        }
                        // View toggle
                        IconButton(onClick = {
                            val newMode = if (viewMode == "messages") "topics" else "messages"
                            viewMode = newMode
                            topicDetailKey = null
                            ConfigStore.setViewMode(context, newMode)
                        }) {
                            Icon(
                                if (viewMode == "messages") Icons.Default.GridView else Icons.Default.ViewList,
                                contentDescription = if (viewMode == "messages") I18n["topic_view"] else I18n["message_view"],
                                tint = if (viewMode == "topics") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                            )
                        }
                        // Filter button
                        Box {
                            IconButton(onClick = { showFilterMenu = true }) {
                                Icon(
                                    Icons.Default.FilterList,
                                    contentDescription = i18n("filter"),
                                    tint = if (currentFilter != MessageFilter.ALL) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                                )
                            }
                            DropdownMenu(
                                expanded = showFilterMenu,
                                onDismissRequest = { showFilterMenu = false }
                            ) {
                                DropdownMenuItem(
                                    text = { Text(i18n("filter_all")) },
                                    onClick = { currentFilter = MessageFilter.ALL; showFilterMenu = false },
                                    leadingIcon = { if (currentFilter == MessageFilter.ALL) Icon(Icons.Default.Check, null, tint = MaterialTheme.colorScheme.primary) }
                                )
                                DropdownMenuItem(
                                    text = { Text(i18n("filter_unread")) },
                                    onClick = { currentFilter = MessageFilter.UNREAD; showFilterMenu = false },
                                    leadingIcon = { if (currentFilter == MessageFilter.UNREAD) Icon(Icons.Default.Check, null, tint = MaterialTheme.colorScheme.primary) }
                                )
                                DropdownMenuItem(
                                    text = { Text(i18n("filter_read")) },
                                    onClick = { currentFilter = MessageFilter.READ; showFilterMenu = false },
                                    leadingIcon = { if (currentFilter == MessageFilter.READ) Icon(Icons.Default.Check, null, tint = MaterialTheme.colorScheme.primary) }
                                )
                                DropdownMenuItem(
                                    text = { Text(i18n("filter_flagged")) },
                                    onClick = { currentFilter = MessageFilter.FLAGGED; showFilterMenu = false },
                                    leadingIcon = { if (currentFilter == MessageFilter.FLAGGED) Icon(Icons.Default.Check, null, tint = MaterialTheme.colorScheme.primary) }
                                )
                            }
                        }
                        IconButton(onClick = onOpenSettings) {
                            Icon(Icons.Default.Settings, contentDescription = i18n("settings"))
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        contentWindowInsets = WindowInsets(0)
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            AnimatedVisibility(visible = showSearch, enter = fadeIn(), exit = fadeOut()) {
                TextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text(i18n("search_hint"), fontSize = 14.sp) },
                    singleLine = true,
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }, modifier = Modifier.size(20.dp)) {
                                Icon(Icons.Default.Close, contentDescription = i18n("cancel"), modifier = Modifier.size(16.dp))
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    shape = RoundedCornerShape(24.dp),
                    colors = TextFieldDefaults.colors(
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                        focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    )
                )
            }

            // Swipe from left edge or press system back to return from topic detail
            if (topicDetailKey != null) {
                BackHandler { topicDetailKey = null }
            }

            // Topic detail back bar (when viewing a specific topic's messages)
            if (topicDetailKey != null) {
                val topicGroup = groupByTopic(filtered).find { it.key == topicDetailKey }
                if (topicGroup != null) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .pointerInput(Unit) {
                                val threshold = 50f * density
                                var totalDragX = 0f
                                detectHorizontalDragGestures(
                                    onDragEnd = {
                                        if (totalDragX > threshold) {
                                            topicDetailKey = null
                                        }
                                        totalDragX = 0f
                                    },
                                    onDragCancel = { totalDragX = 0f },
                                    onHorizontalDrag = { change, dragAmount ->
                                        change.consume()
                                        if (dragAmount > 0) totalDragX += dragAmount
                                    }
                                )
                            }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = { topicDetailKey = null }) {
                            Icon(Icons.Default.ArrowBack, contentDescription = I18n["back"])
                        }
                        TopicAvatar(
                            topicIcon = topicGroup.topicIcon,
                            topicName = topicGroup.topicName,
                            topicDisplayName = topicGroup.topicDisplayName,
                            size = 28,
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            topicGroup.topicDisplayName ?: topicGroup.topicName ?: I18n["no_topic"],
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            if (filtered.isEmpty()) {
                val emptyMessage = when {
                    searchQuery.isNotBlank() -> i18n("no_messages_search")
                    currentFilter == MessageFilter.UNREAD -> i18n("no_messages_unread")
                    currentFilter == MessageFilter.READ -> i18n("no_messages_read")
                    currentFilter == MessageFilter.FLAGGED -> i18n("no_messages_flagged")
                    else -> i18n("no_messages")
                }
                val emptyHint = if (currentFilter == MessageFilter.ALL && searchQuery.isBlank()) i18n("no_messages_hint") else null
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            if (searchQuery.isNotBlank()) Icons.Default.SearchOff else Icons.Default.Inbox,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(
                            emptyMessage,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (emptyHint != null) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                emptyHint,
                                fontSize = 13.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            } else if (viewMode == "topics" && topicDetailKey == null) {
                // ── Topic List View ──
                val topicGroups = remember(filtered) { groupByTopic(filtered) }
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(topicGroups, key = { it.key }) { group ->
                        val latest = group.messages.first()
                        val totalCount = group.messages.size
                        val unreadCount = group.messages.count { !it.read }
                        val displayName = group.topicDisplayName ?: group.topicName ?: I18n["no_topic"]
                        val preview = latest.title.ifBlank { latest.body }.take(80)

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { topicDetailKey = group.key }
                                .padding(horizontal = 16.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            TopicAvatar(
                                topicIcon = group.topicIcon,
                                topicName = group.topicName,
                                topicDisplayName = group.topicDisplayName,
                                size = 40,
                            )
                            Spacer(Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(displayName, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, false))
                                    Spacer(Modifier.width(6.dp))
                                    Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                                        Text(totalCount.toString(), fontSize = 10.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp))
                                    }
                                    if (unreadCount > 0) {
                                        Spacer(Modifier.width(4.dp))
                                        Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.error) {
                                            Text(unreadCount.toString(), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White, modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp))
                                        }
                                    }
                                }
                                Spacer(Modifier.height(2.dp))
                                Text(preview, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Spacer(Modifier.width(8.dp))
                            Text(formatRelativeTime(latest.receivedAt), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            } else {
                // ── Message List View (or topic detail messages) ──
                val displayMessages = if (topicDetailKey != null) {
                    filtered.filter { (it.topicId ?: "__no_topic__") == topicDetailKey }
                } else filtered

                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .onGloballyPositioned { listTopPx = it.positionInWindow().y }
                        .pointerInput(selectionMode) {
                            if (!selectionMode) return@pointerInput
                            detectDragGesturesAfterLongPress(
                                onDragStart = { offset ->
                                    rangeSelectStartY = offset.y
                                    rangeSelectPrevId = rangeSelectStartId
                                },
                                onDrag = { change, dragAmount ->
                                    change.consume()
                                    rangeSelectStartY += dragAmount.y
                                    val fingerY = rangeSelectStartY + listTopPx
                                    val visibleItems = listState.layoutInfo.visibleItemsInfo
                                    val targetItem = visibleItems.lastOrNull { item ->
                                        val itemTop = listTopPx + item.offset
                                        val itemBottom = itemTop + item.size
                                        fingerY >= itemTop && fingerY < itemBottom
                                    } ?: visibleItems.lastOrNull { item ->
                                        listTopPx + item.offset <= fingerY
                                    }
                                    if (targetItem != null && targetItem.key is String) {
                                        val targetId = targetItem.key as String
                                        if (targetId != rangeSelectPrevId) {
                                            rangeSelectPrevId = targetId
                                            selectRange(filtered, rangeSelectStartId!!, targetId)
                                        }
                                    }
                                },
                                onDragEnd = {
                                    rangeSelectPrevId = null
                                },
                                onDragCancel = {
                                    rangeSelectPrevId = null
                                }
                            )
                        },
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    items(displayMessages, key = { it.id }) { msg ->
                        val dismissState = rememberSwipeToDismissBoxState(
                            confirmValueChange = { value ->
                                when (value) {
                                    SwipeToDismissBoxValue.EndToStart -> {
                                        // Swipe left to delete
                                        scope.launch {
                                            val deleted = MessageStore.delete(context, msg.id)
                                            if (deleted != null) {
                                                lastDeletedMessage = deleted
                                                lastDeletedIndex = allMessages.indexOfFirst { it.id == msg.id }
                                            }
                                        }
                                        true
                                    }
                                    SwipeToDismissBoxValue.StartToEnd -> {
                                        // Swipe right to flag
                                        scope.launch { MessageStore.toggleFlag(context, msg.id) }
                                        false // Don't dismiss, just toggle flag
                                    }
                                    else -> false
                                }
                            }
                        )

                        SwipeToDismissBox(
                            state = dismissState,
                            enableDismissFromStartToEnd = true,
                            enableDismissFromEndToStart = true,
                            backgroundContent = {
                                val direction = dismissState.dismissDirection
                                val color = when (direction) {
                                    SwipeToDismissBoxValue.StartToEnd -> MaterialTheme.colorScheme.primary
                                    SwipeToDismissBoxValue.EndToStart -> MaterialTheme.colorScheme.error
                                    else -> Color.Transparent
                                }
                                val icon = when (direction) {
                                    SwipeToDismissBoxValue.StartToEnd -> Icons.Default.Flag
                                    SwipeToDismissBoxValue.EndToStart -> Icons.Default.Delete
                                    else -> Icons.Default.Delete
                                }
                                val alignment = when (direction) {
                                    SwipeToDismissBoxValue.StartToEnd -> Alignment.CenterStart
                                    else -> Alignment.CenterEnd
                                }
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .background(color)
                                        .padding(horizontal = 20.dp),
                                    contentAlignment = alignment
                                ) {
                                    Icon(icon, contentDescription = null, tint = Color.White)
                                }
                            }
                        ) {
                            MessageItem(
                                msg = msg,
                                selectionMode = selectionMode,
                                isSelected = selectedIds.contains(msg.id),
                                onLongClick = {
                                    if (!selectionMode) {
                                        selectionMode = true
                                        selectedIds.add(msg.id)
                                    }
                                    rangeSelectStartId = msg.id
                                },
                                onClick = {
                                    if (selectionMode) {
                                        if (selectedIds.contains(msg.id)) {
                                            selectedIds.remove(msg.id)
                                            if (selectedIds.isEmpty()) exitSelectionMode()
                                        } else {
                                            selectedIds.add(msg.id)
                                        }
                                    } else {
                                        if (!msg.read) {
                                            scope.launch { MessageStore.markAsRead(context, msg.id) }
                                        }
                                        selectedMessage = msg
                                    }
                                },
                                onDoubleClick = {
                                    if (!msg.url.isNullOrEmpty()) {
                                        try {
                                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(msg.url)))
                                        } catch (_: Exception) {
                                            Toast.makeText(context, "Invalid URL", Toast.LENGTH_SHORT).show()
                                        }
                                    } else {
                                        val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                                        val clip = android.content.ClipData.newPlainText("message", msg.body)
                                        clipboard.setPrimaryClip(clip)
                                        Toast.makeText(context, I18n["copied"], Toast.LENGTH_SHORT).show()
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text(i18n("dash_clear_confirm_title")) },
            text = { Text("${i18n("dash_clear_confirm")} (${selectedIds.size})") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch { MessageStore.deleteByIds(context, selectedIds.toList()) }
                    exitSelectionMode()
                    showDeleteConfirm = false
                }) {
                    Text(i18n("confirm"), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) {
                    Text(i18n("cancel"))
                }
            }
        )
    }

    // Offline dialog
    val showOfflineDialog = pollService?.showOfflineDialog?.value == true
    if (showOfflineDialog) {
        AlertDialog(
            onDismissRequest = {
                // Click outside = enter offline mode
                pollService?.enterOfflineMode()
            },
            title = { Text(i18n("offline_title")) },
            text = { Text(i18n("offline_message")) },
            confirmButton = {
                TextButton(onClick = {
                    pollService?.enterOfflineMode()
                }) {
                    Text(i18n("offline_mode"))
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    pollService?.switchAccount()
                    onOpenSettings()
                }) {
                    Text(i18n("offline_switch"))
                }
            }
        )
    }

    // Message detail screen
    selectedMessage?.let { msg ->
        MessageDetailScreen(
            msg = msg,
            onBack = { selectedMessage = null },
            onDownload = { url, filename ->
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    context.startActivity(intent)
                } catch (_: Exception) {
                    Toast.makeText(context, "Cannot open URL", Toast.LENGTH_SHORT).show()
                }
            }
        )
        return // Don't show the list when viewing detail
    }
}

@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
private fun MessageItem(
    msg: LocalMessage,
    selectionMode: Boolean,
    isSelected: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onDoubleClick: () -> Unit,
) {
    val bgColor = when {
        selectionMode && isSelected -> MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
        else -> MaterialTheme.colorScheme.surface
    }

    val levelColor = when (msg.level.uppercase()) {
        "ERROR" -> MaterialTheme.colorScheme.error
        "WARN", "WARNING" -> Color(0xFFF59E0B)
        "DEBUG" -> MaterialTheme.colorScheme.tertiary
        else -> MaterialTheme.colorScheme.primary
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(bgColor)
            .combinedClickable(
                onClick = onClick,
                onLongClick = onLongClick,
                onDoubleClick = onDoubleClick
            )
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Top
    ) {
        if (selectionMode) {
            Checkbox(
                checked = isSelected,
                onCheckedChange = { onClick() },
                modifier = Modifier.padding(end = 8.dp).size(20.dp)
            )
        } else {
            TopicAvatar(
                topicIcon = msg.topicIcon,
                topicName = msg.topicName,
                topicDisplayName = msg.topicDisplayName,
                size = 36,
                borderColor = levelColor,
            )
            Spacer(Modifier.width(10.dp))
        }

        Column(modifier = Modifier.weight(1f)) {
            val displayTitle = if (msg.title.isNotBlank()) msg.title else I18n["untitled"]
            Text(
                displayTitle,
                fontWeight = if (msg.read) FontWeight.Medium else FontWeight.Black,
                fontSize = 14.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = if (msg.title.isNotBlank()) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(2.dp))
            Text(
                msg.body,
                fontSize = 13.sp,
                fontWeight = if (msg.read) FontWeight.Normal else FontWeight.ExtraBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = if (msg.read) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface
            )

            // Extended fields: tags, url, attachment
            val parsedTags: List<String> = try {
                if (msg.tags != null && msg.tags != "[]") {
                    com.google.gson.Gson().fromJson(msg.tags, object : com.google.gson.reflect.TypeToken<List<String>>() {}.type)
                } else emptyList()
            } catch (_: Exception) { emptyList() }
            val hasExtendedFields = parsedTags.isNotEmpty() || msg.url != null || msg.attachment != null
            if (hasExtendedFields) {
                Spacer(Modifier.height(4.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalArrangement = Arrangement.spacedBy(3.dp)
                ) {
                    if (msg.url != null) {
                        Text("🔗", fontSize = 11.sp)
                    }
                    if (msg.attachment != null) {
                        Text("📎", fontSize = 11.sp)
                    }
                    parsedTags.forEach { tag ->
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            border = androidx.compose.foundation.BorderStroke(
                                0.5.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
                            )
                        ) {
                            Text(
                                tag,
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 5.dp)
                            )
                        }
                    }
                }
            }
        }

        Spacer(Modifier.width(8.dp))
        Column(
            horizontalAlignment = Alignment.End
        ) {
            Text(
                formatRelativeTime(msg.receivedAt),
                fontSize = 11.sp,
                color = if (msg.read) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary,
                fontWeight = if (msg.read) FontWeight.Normal else FontWeight.Black
            )
            if (msg.flagged) {
                Spacer(Modifier.height(2.dp))
                Icon(
                    Icons.Default.Flag,
                    contentDescription = I18n["flagged"],
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(14.dp)
                )
            }
        }
    }
}

private fun formatRelativeTime(dateStr: String): String {
    return try {
        val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
        val date = sdf.parse(dateStr) ?: return dateStr
        val now = System.currentTimeMillis()
        val diff = now - date.time

        when {
            diff < 60_000 -> I18n["time_just_now"]
            diff < 3_600_000 -> "${(diff / 60_000).toInt()} ${I18n["time_minutes_ago"]}"
            diff < 86_400_000 -> "${(diff / 3_600_000).toInt()} ${I18n["time_hours_ago"]}"
            diff < 2_592_000_000 -> "${(diff / 86_400_000).toInt()} ${I18n["time_days_ago"]}"
            else -> {
                val outFmt = SimpleDateFormat("MM/dd", Locale.getDefault())
                outFmt.format(date)
            }
        }
    } catch (_: Exception) {
        dateStr
    }
}
