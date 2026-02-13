# 待办翻译调试步骤

## 立即执行以下步骤（2 分钟）

### 第 1 步：打开浏览器控制台

1. 在页面上按 **F12**（或右键 → 检查）
2. 点击顶部的 **Console**（控制台）标签页

### 第 2 步：清空日志并刷新

1. 在控制台里点击 **清空** 图标（🚫 或垃圾桶图标）
2. 按 **Ctrl+R** 刷新页面

### 第 3 步：查看自动翻译日志

在控制台搜索框输入：`翻译待办`

**应该能看到类似**：
```
[翻译待办 useEffect] 检查条件 {needsTranslate: true, hasStore: true, currentLocale: "en-US", pendingTasksCount: 9, ...}
[翻译待办 useEffect] ✅ 触发自动翻译 for locale: en-US
[翻译待办] 开始翻译 {storeId: "xxx", locale: "en-US"}
```

**请将看到的所有日志复制给我！**

### 第 4 步：手动点击翻译按钮

1. 点击待办区域右上角的 **"Show in current language"** 按钮
2. 观察控制台是否有新日志出现

**应该看到**：
```
[翻译待办] 开始翻译 {storeId: "...", locale: "en-US"}
[翻译待办] API 返回 {translated: 9, total: 9}
```

**或者看到错误**：
```
翻译待办失败 Error: ...
```

### 第 5 步：检查 Network（如果控制台无日志）

1. 在开发者工具点击 **Network**（网络）标签页
2. 点击翻译按钮
3. 在请求列表搜索：`translate-for-locale`
4. 点击该请求，查看：
   - **Status**（状态码）：应该是 200
   - **Response**（响应）：应该有 `{translated: X, total: X}`

---

## 临时测试（在控制台直接执行）

在浏览器控制台粘贴并执行（会显示翻译是否工作）：

```javascript
const token = localStorage.getItem('token');
const storeId = localStorage.getItem('selectedStoreId');

console.log('Token:', token ? '已获取' : '❌ 未登录');
console.log('Store ID:', storeId || '❌ 未选择店铺');

if (token && storeId) {
  fetch('/api/tasks/translate-for-locale', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      storeId: storeId,
      locale: 'en-US'
    })
  })
  .then(r => {
    console.log('响应状态:', r.status);
    return r.json();
  })
  .then(d => {
    console.log('✅ 翻译结果:', d);
    if (d.error === 'QUOTA_EXCEEDED') {
      console.warn('⚠️ 触发每日限额');
    } else if (d.translated > 0) {
      console.log('✅ 成功翻译', d.translated, '条待办');
      alert('翻译成功！请刷新页面查看效果。');
    } else {
      console.log('ℹ️ 未翻译任何项（可能都已有缓存）');
    }
  })
  .catch(e => console.error('❌ 请求失败:', e));
} else {
  console.error('❌ 缺少必要信息：请先登录并选择店铺');
}
```

---

## 请提供以下信息

将以下内容截图或复制给我：

1. **控制台中所有 `[翻译待办]` 开头的日志**
2. **上述测试脚本的输出结果**
3. **如果有红色错误**：完整错误堆栈

这样我能立即定位问题！
