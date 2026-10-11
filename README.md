# Word Novel 📚

上传喜欢的英文小说，AI 自动提取重点词，生成英文填空 / 选择题来背单词。

- **纯静态**：无后端、无构建，全部逻辑在浏览器里跑
- **数据本地**：书籍、练习、进度、生词本全部存在浏览器 localStorage
- **BYOK**：自带 API Key，支持 OpenAI 兼容接口（OpenAI / DeepSeek / OpenRouter / 腾讯 TokenHub 等）和 Google Gemini，Key 只存本地
- **生词本 + 复习**：做错的词自动进生词本，Leitner 间隔复习
- **可导出**：全部数据可导出 JSON 备份，生词本可导出 CSV

## 使用

1. 打开网站 → 「设置」配置 AI 服务商和 API Key → 测试连接
2. 「书架」上传英文小说 .txt
3. 进入书详情 → 选难度 → 「生成练习」（逐块生成，可中断、可重试）
4. 「练习」开始做题；错词自动进生词本
5. 生词到期后，练习页顶部会出现复习提醒

## 本地开发

ES modules 需要 http 服务（直接开 file:// 不行）：

```bash
cd word-novel
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

## 部署

推送 main 分支后 GitHub Pages 自动重新部署：

```bash
git add -A && git commit -m "..." && git push
```
