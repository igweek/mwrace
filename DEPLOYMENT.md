# 部署文档

本文档说明如何把“无论走多远别忘记为何而出发”部署到 Vercel，并连接 Supabase 保存登录用户的班级、小组和历史总分。

## 1. 项目结构

- `index.html`：页面入口。
- `styles.css`：页面样式和暗色/淡色主题。
- `app.js`：比赛逻辑、登录逻辑、Supabase 读写逻辑。
- `api/config.js`：Vercel Serverless API，用来把环境变量安全传给前端。
- `supabase/schema.sql`：Supabase 数据表、索引、触发器和 RLS 策略。
- `assets/`：图标和角色图片资源。

## 2. 本地预览

这个项目是静态页面，可以直接打开 `index.html` 预览游客模式。

如果想用本地服务预览：

```bash
python3 -m http.server 5178
```

然后打开：

```text
http://127.0.0.1:5178/
```

本地静态服务下 `/api/config` 可能会返回 404，这是正常的；游客模式仍可使用。登录和云端保存需要部署到 Vercel，或使用支持 `api/config.js` 的本地 Serverless 环境。

## 3. 创建 Supabase 项目

1. 登录 Supabase。
2. 创建一个新项目。
3. 进入项目后打开 `SQL Editor`。
4. 新建 Query，把 `supabase/schema.sql` 的全部内容复制进去执行。

执行后会创建：

- `classes`：班级表。
- `groups`：小组表，包含 `points` 历史总分。
- RLS 策略：每个登录用户只能访问自己的班级和小组。

## 4. 开启邮箱登录

在 Supabase 项目中：

1. 进入 `Authentication`。
2. 进入 `Providers`。
3. 启用 `Email` 登录方式。
4. 按需要设置是否要求邮箱验证。

如果开启邮箱验证，用户注册后需要先完成邮箱确认才能登录。

## 5. 获取 Supabase 环境变量

在 Supabase 项目中进入：

```text
Project Settings > API
```

需要两个值：

- `Project URL`
- `anon public key`

部署时分别填入：

```text
SUPABASE_URL=你的 Project URL
SUPABASE_ANON_KEY=你的 anon public key
```

不要使用 `service_role` key。

## 6. 部署到 Vercel

1. 把项目上传到 GitHub。
2. 登录 Vercel。
3. 点击 `Add New Project`。
4. 选择这个 GitHub 仓库。
5. Framework Preset 选择 `Other` 或保持默认。
6. Build Command 留空。
7. Output Directory 留空。
8. 在 Environment Variables 中添加：

```text
SUPABASE_URL
SUPABASE_ANON_KEY
```

9. 点击 Deploy。

部署完成后，页面会通过 `/api/config` 读取环境变量，前端不会直接写死 Supabase URL 和 key。

## 7. 部署后检查

打开 Vercel 生成的网址，按下面顺序检查：

1. 页面能正常打开。
2. 游客模式能直接比赛。
3. 点击右上角设置。
4. 输入邮箱和密码注册。
5. 如果开启邮箱验证，先完成邮箱确认。
6. 登录后创建班级。
7. 创建小组。
8. 点击角色前进，完成一轮并抽取奖励。
9. 刷新页面，确认历史总分从 Supabase 读取回来。

## 8. 积分逻辑

- 游客模式：数据只保存在当前浏览器前端，不写入 Supabase。
- 登录模式：班级、小组、历史总分写入 Supabase。
- 前进一次：当前队伍本轮得分 `+1`。
- 右键后退一次：当前队伍本轮得分 `-1`。
- 到达终点后抽奖：奖励分计入该队伍本轮得分。
- 收下奖励后：本轮得分写入 Supabase 的 `groups.points` 历史总分。
- 重开本轮：只清空当前赛道进度和本轮得分，不清空历史总分。
- 清空历史总分：会把当前班级所有小组的 `points` 置为 `0`。

如果抽奖后发现点错并右键后退，页面会把本轮已经写入 Supabase 的分数回滚。

## 9. 常见问题

### 游客模式正常，但登录按钮不可用

通常是 Supabase 环境变量没有配置，或 `/api/config` 没有返回 `url` 和 `anonKey`。

检查 Vercel 环境变量：

```text
SUPABASE_URL
SUPABASE_ANON_KEY
```

修改环境变量后需要重新部署。

### 注册成功但登录失败

如果 Supabase 开启了邮箱验证，需要先完成邮箱确认。

### 登录后看不到班级或小组

这是正常的。每个用户的数据隔离，第一次登录需要先创建班级和小组。

### Supabase 写入失败

检查是否执行了 `supabase/schema.sql`，并确认 RLS 策略存在。也要确认前端登录用户和写入数据的 `owner_id` 一致。

### 本地预览 `/api/config` 404

直接用 `python3 -m http.server` 时没有 Vercel Serverless API，所以 `/api/config` 会 404。部署到 Vercel 后会正常。

## 10. 更新部署

修改代码后：

1. 提交并推送到 GitHub。
2. Vercel 会自动重新部署。
3. 如果只改环境变量，需要在 Vercel 手动触发 Redeploy。

