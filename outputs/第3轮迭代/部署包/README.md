# 部署包 - 第3轮迭代

生成时间: 2026-02-06T07:01:28.027Z

## 文件说明

- `apply_config.sh`: 配置更新脚本
- `deploy.sh`: 部署脚本
- `ab_test_config.json`: A/B 测试配置


## 使用说明

1. 检查配置: `bash apply_config.sh --dry-run`
2. 执行部署: `bash deploy.sh`

## 注意事项

- 部署前请先备份
- 建议在测试环境验证后再部署到生产环境
