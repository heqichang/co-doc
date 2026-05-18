# Co-Doc - 富文本编辑器

## 功能特性

- 用户注册/登录（JWT Token 认证）
- 文档创建、编辑、删除、搜索
- 富文本编辑（加粗、斜体、下划线、删除线）
- 标题 H1-H6、有序/无序列表
- 文本对齐、文字颜色、背景色
- 插入链接和图片（上传到 MinIO）
- 撤销/重做、快捷键支持
- 自动保存（3秒防抖）+ 手动保存（Ctrl+S）
- 保存状态指示（已保存/保存中/保存失败）
- 响应式布局，支持移动端

## 技术栈

- 前端：React 18 + React Router + React Quill + Axios
- 后端：Python + FastAPI + SQLAlchemy
- 数据库：PostgreSQL
- 存储：MinIO 对象存储

## 快速开始

### 1. 安装依赖

#### 后端
```bash
cd backend
pip install -r requirements.txt
```

#### 前端
```bash
cd frontend
npm install
```

### 2. 配置环境变量

复制 `backend/.env.example` 为 `backend/.env` 并修改配置：

```
DATABASE_URL=postgresql://user:password@localhost:5432/codoc
SECRET_KEY=your-secret-key-here
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

### 3. 启动服务

确保 PostgreSQL 和 MinIO 服务已启动。

#### 启动后端（端口 8000）
```bash
cd backend
uvicorn main:app --reload
```

#### 启动前端（端口 3000）
```bash
cd frontend
npm run dev
```

### 4. 访问应用

打开浏览器访问 http://localhost:3000

## API 文档

后端启动后访问 http://localhost:8000/docs 查看 Swagger API 文档。
