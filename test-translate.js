// 快速测试翻译接口
const fetch = require('node-fetch');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MDk4ODAwMDB9.xxx'; // 需要有效 token

async function testTranslate() {
  try {
    console.log('测试翻译接口...');
    const res = await fetch('http://localhost:3000/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        text: '提升周播蓝筹',
        targetLang: 'en-US',
        sourceLang: 'zh-CN'
      })
    });
    const data = await res.json();
    console.log('翻译结果:', data);
  } catch (e) {
    console.error('错误:', e);
  }
}

testTranslate();
