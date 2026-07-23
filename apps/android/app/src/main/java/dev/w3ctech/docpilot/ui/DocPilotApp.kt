package dev.w3ctech.docpilot.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import dev.w3ctech.docpilot.AppViewModel
import dev.w3ctech.docpilot.Page
import dev.w3ctech.docpilot.data.DocumentItem

@Composable
fun DocPilotApp(model: AppViewModel) {
  if (model.restoring) {
    Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) { CircularProgressIndicator() }
    return
  }
  model.error?.let {
    AlertDialog(
      onDismissRequest = model::clearError,
      confirmButton = { TextButton(onClick = model::clearError) { Text("知道了") } },
      title = { Text("操作未完成") },
      text = { Text(it) },
    )
  }
  if (model.session == null) LoginScreen(model) else Workspace(model)
}

@Composable
private fun LoginScreen(model: AppViewModel) {
  val context = LocalContext.current
  var email by remember { mutableStateOf("") }
  var secret by remember { mutableStateOf("") }
  var useOtp by remember { mutableStateOf(true) }
  Column(
    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 72.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp),
  ) {
    Text("DocPilot", style = MaterialTheme.typography.displaySmall, fontFamily = FontFamily.Serif)
    Text("让每一页都有据可循", color = MaterialTheme.colorScheme.secondary)
    Spacer(Modifier.height(20.dp))
    OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("邮箱") }, singleLine = true)
    if (!useOtp || model.otpSent) {
      OutlinedTextField(secret, { secret = it }, Modifier.fillMaxWidth(), label = { Text(if (useOtp) "验证码" else "密码") }, singleLine = true)
    }
    Button(
      onClick = {
        if (useOtp && !model.otpSent) model.sendOtp(email) else model.login(email, secret, useOtp)
      },
      enabled = !model.busy && email.isNotBlank(),
      modifier = Modifier.fillMaxWidth(),
    ) { Text(if (model.busy) "请稍候…" else if (useOtp && !model.otpSent) "发送验证码" else "登录") }
    TextButton(onClick = { useOtp = !useOtp; secret = "" }) {
      Text(if (useOtp) "改用邮箱密码登录" else "改用邮箱验证码登录")
    }
    OutlinedButton(onClick = { model.googleSignIn(context) }, modifier = Modifier.fillMaxWidth()) {
      Text("使用 Google 登录")
    }
  }
}

@Composable
private fun Workspace(model: AppViewModel) {
  val context = LocalContext.current
  var notificationsGranted by remember {
    mutableStateOf(
      Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED,
    )
  }
  val notificationsPermission =
    rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
      notificationsGranted = it
    }
  LaunchedEffect(Unit) {
    if (!notificationsGranted && Build.VERSION.SDK_INT >= 33) {
      notificationsPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
  }
  val primary = model.page == Page.Documents || model.page == Page.Account
  Scaffold(
    bottomBar = {
      if (primary) BottomAppBar {
        NavigationBarItem(
          selected = model.page == Page.Documents,
          onClick = { model.page = Page.Documents },
          icon = { Icon(Icons.Default.Description, null) },
          label = { Text("文档") },
        )
        NavigationBarItem(
          selected = model.page == Page.Account,
          onClick = { model.page = Page.Account; model.loadAccount() },
          icon = { Icon(Icons.Default.AccountCircle, null) },
          label = { Text("账户") },
        )
      }
    },
  ) { padding ->
    Box(Modifier.padding(padding)) {
      when (model.page) {
        Page.Documents -> DocumentsScreen(model)
        Page.Account -> AccountScreen(model)
        Page.Search -> SearchScreen(model)
        Page.Notifications -> NotificationsScreen(model)
        Page.Scanner -> ScannerScreen(model)
        Page.Reader -> ReaderScreen(model)
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DocumentsScreen(model: AppViewModel) {
  val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { it?.let(model::upload) }
  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("我的文档") },
        actions = {
          IconButton(onClick = { model.page = Page.Search }) { Icon(Icons.Default.Search, "搜索文档") }
          IconButton(onClick = { model.page = Page.Notifications; model.loadNotifications() }) {
            Icon(Icons.Default.Notifications, "通知")
          }
        },
      )
    },
    floatingActionButton = {
      FloatingActionButton(onClick = { picker.launch(arrayOf("application/pdf")) }) {
        Icon(Icons.Default.Add, "上传 PDF")
      }
    },
  ) { padding ->
    if (model.documents.isEmpty() && !model.busy) {
      Column(Modifier.padding(padding).fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center) {
        Text("还没有文档", style = MaterialTheme.typography.headlineSmall)
        Text("上传 PDF，开始阅读、搜索和有引用的问答。")
      }
    } else LazyColumn(Modifier.padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      items(model.documents, key = { it.id }) { DocumentCard(it) { model.open(it) } }
    }
  }
}

@Composable
private fun DocumentCard(document: DocumentItem, open: () -> Unit) {
  Card(Modifier.fillMaxWidth().clickable(onClick = open).semantics { contentDescription = "打开文档 ${document.title}" }) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
      Text(document.title, fontWeight = FontWeight.SemiBold)
      Text(
        when (document.status) {
          "ready", "partially_ready" -> "${document.pageCount ?: "—"} 页 · 可阅读"
          "failed" -> "处理失败 · ${document.errorCode ?: "可稍后重试"}"
          else -> "${document.currentStage ?: document.status} · ${document.progress}%"
        },
        color = MaterialTheme.colorScheme.secondary,
      )
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BackPage(title: String, model: AppViewModel, content: @Composable (PaddingValues) -> Unit) {
  Scaffold(
    topBar = { TopAppBar(title = { Text(title) }, navigationIcon = {
      IconButton(onClick = { model.page = Page.Documents }) { Icon(Icons.Default.ArrowBack, "返回") }
    }) },
    content = content,
  )
}

@Composable
private fun SearchScreen(model: AppViewModel) {
  var query by remember { mutableStateOf("") }
  BackPage("搜索", model) { padding ->
    Column(Modifier.padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), label = { Text("搜索文档内容") })
      Button(onClick = { model.search(query) }, enabled = query.trim().length >= 2) { Text("搜索") }
      LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(model.searchResults) { result ->
          Card(Modifier.fillMaxWidth().clickable {
            model.documents.firstOrNull { it.id == result.documentId }?.let { model.open(it, result.passages.firstOrNull()?.pageStart) }
          }) {
            Column(Modifier.padding(14.dp)) {
              Text(result.title, fontWeight = FontWeight.Bold)
              Text(result.passages.firstOrNull()?.content ?: "", maxLines = 3)
            }
          }
        }
      }
    }
  }
}

@Composable
private fun NotificationsScreen(model: AppViewModel) {
  BackPage("通知", model) { padding ->
    LazyColumn(Modifier.padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      items(model.notifications) {
        Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp)) { Text(it.title, fontWeight = FontWeight.Bold); Text(it.body) } }
      }
    }
  }
}

@Composable
private fun AccountScreen(model: AppViewModel) {
  var confirmDelete by remember { mutableStateOf(false) }
  Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
    Text("账户", style = MaterialTheme.typography.headlineMedium)
    Text(model.session?.user?.name ?: "")
    Text(model.session?.user?.email ?: "", color = MaterialTheme.colorScheme.secondary)
    model.usage?.let {
      Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) {
        Text("本月用量", fontWeight = FontWeight.Bold)
        Text("文档 ${it.documentCount.used} / ${it.documentCount.limit}")
        Text("提问 ${it.monthlyQuestions.used} / ${it.monthlyQuestions.limit}")
        Text("存储 ${it.storageBytes.used / 1024 / 1024} MB / ${it.storageBytes.limit / 1024 / 1024} MB")
      } }
    }
    OutlinedButton(onClick = { model.page = Page.Scanner }, Modifier.fillMaxWidth()) { Text("扫码登录网页版") }
    OutlinedButton(onClick = model::signOut, Modifier.fillMaxWidth()) { Text("退出登录") }
    TextButton(onClick = { confirmDelete = true }, Modifier.fillMaxWidth()) { Text("注销账户") }
  }
  if (confirmDelete) AlertDialog(
    onDismissRequest = { confirmDelete = false },
    title = { Text("确认注销账户？") },
    text = { Text("账户将进入 7 天冷静期，随后永久删除。") },
    dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("取消") } },
    confirmButton = { TextButton(onClick = { confirmDelete = false; model.deleteAccount() }) { Text("确认注销") } },
  )
}

@Composable
private fun ScannerScreen(model: AppViewModel) {
  val context = LocalContext.current
  var code by remember { mutableStateOf("") }
  var granted by remember {
    mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
  }
  val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
  LaunchedEffect(Unit) { if (!granted) permission.launch(Manifest.permission.CAMERA) }
  BackPage("扫码登录网页版", model) { padding ->
    Column(Modifier.padding(padding).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
      if (granted) ScannerView(Modifier.fillMaxWidth().height(280.dp)) { code = it }
      else Text("需要相机权限才能扫描二维码。")
      OutlinedTextField(code, { code = it }, Modifier.fillMaxWidth(), label = { Text("用户码") })
      Button(onClick = { model.approve(code.trim()) }, enabled = code.trim().length >= 4) { Text("确认授权") }
    }
  }
}

@Composable
private fun ReaderScreen(model: AppViewModel) {
  var question by remember { mutableStateOf("") }
  BackPage(model.selectedDocument?.title ?: "阅读", model) { padding ->
    Column(Modifier.padding(padding).fillMaxSize()) {
      model.pdfPage?.let { bitmap ->
        Image(
          bitmap.asImageBitmap(),
          contentDescription = "PDF 第 ${model.pdfPageIndex + 1} 页",
          modifier = Modifier.fillMaxWidth().weight(1f),
          contentScale = ContentScale.Fit,
        )
      } ?: Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = androidx.compose.ui.Alignment.Center) { CircularProgressIndicator() }
      Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        TextButton(onClick = { model.renderPage(model.pdfPageIndex - 1) }, enabled = model.pdfPageIndex > 0) { Text("上一页") }
        Text("${model.pdfPageIndex + 1} / ${model.pdfPageCount}")
        TextButton(onClick = { model.renderPage(model.pdfPageIndex + 1) }, enabled = model.pdfPageIndex + 1 < model.pdfPageCount) { Text("下一页") }
      }
      TextButton(onClick = model::highlightCurrentPage, Modifier.fillMaxWidth()) {
        Text(if (model.pdfPageIndex + 1 in model.highlightedPages) "本页已高亮" else "高亮本页")
      }
      if (model.chatText.isNotBlank()) Card(Modifier.fillMaxWidth().padding(12.dp)) {
        Column(Modifier.padding(12.dp)) {
          Text(model.chatText)
          model.citationPage?.let { page ->
            TextButton(onClick = { model.renderPage(page - 1) }) { Text("查看引用 · 第 $page 页") }
          }
        }
      }
      Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(question, { question = it }, Modifier.weight(1f), label = { Text("向文档提问") })
        Button(onClick = { model.ask(question); question = "" }, enabled = question.isNotBlank() && !model.busy) { Text("发送") }
      }
    }
  }
}
