# 文档解析方案对比分析

## 通用文档解析方案（不限格式）

### 方案对比总览

| 方案 | 支持格式 | 部署方式 | 语言 | 特点 |
|------|----------|----------|------|------|
| **Unstructured.io** | 20+ 格式 | 开源/SaaS | Python | RAG 优化，自动检测格式 |
| **Apache Tika** | 1000+ 格式 | 开源 | Java | 格式支持最全 |
| **LlamaParse** | PDF/DOCX/PPT/图片 | SaaS | Python | 专为 LLM 优化 |
| **Docling** | PDF/DOCX/HTML/图片 | 开源 | Python | IBM 出品，多模态 |
| **Marker** | PDF/EPUB | 开源 | Python | 转 Markdown 高保真 |
| **Azure Document Intelligence** | 20+ 格式 | SaaS | REST | 微软云服务 |
| **AWS Textract** | PDF/图片 | SaaS | REST | 亚马逊云服务 |

---

### 1. Unstructured.io（推荐）

**最通用的开源文档解析库**

#### 支持格式

| 类别 | 格式 |
|------|------|
| 文档 | PDF, DOCX, DOC, PPTX, PPT, XLSX, XLS, RTF, ODT, EPUB |
| 文本 | TXT, Markdown, HTML, XML, JSON, CSV, TSV |
| 邮件 | EML, MSG |
| 图片 | PNG, JPG, JPEG, TIFF, BMP, GIF |
| 其他 | Org-mode, ReStructuredText, MDX |

#### 核心功能

```python
from unstructured.partition.auto import partition

# 自动检测格式并解析
elements = partition("any-file.pdf")  # 或 .docx, .html, .eml, .png 等

# 输出结构化元素
for element in elements:
    print(f"类型: {element.category}")  # Title, Table, NarrativeText, ListItem, etc.
    print(f"文本: {element.text}")
    print(f"元数据: {element.metadata}")
```

#### 元素类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `Title` | 标题 | 文档标题、章节标题 |
| `NarrativeText` | 正文 | 段落文本 |
| `ListItem` | 列表项 | 有序/无序列表 |
| `Table` | 表格 | 结构化表格数据 |
| `Image` | 图片 | 图片描述或 OCR 结果 |
| `Formula` | 公式 | 数学公式 |
| `PageBreak` | 分页 | 页面分隔符 |
| `Header` | 页眉 | 页面顶部内容 |
| `Footer` | 页脚 | 页面底部内容 |

#### 安装

```bash
# 基础安装（支持 TXT, HTML, XML, JSON, EML）
pip install unstructured

# 完整安装（支持所有格式）
pip install "unstructured[all-docs]"

# 按需安装
pip install "unstructured[pdf]"      # PDF 支持
pip install "unstructured[docx]"     # DOCX 支持
pip install "unstructured[image]"    # 图片 OCR
```

#### 系统依赖

```bash
# macOS
brew install libmagic poppler tesseract pandoc

# Ubuntu/Debian
sudo apt-get install libmagic-dev poppler-utils tesseract-ocr pandoc

# Docker（推荐）
FROM quay.io/unstructured-io/unstructured:latest
```

---

### 2. Apache Tika

**格式支持最全的 Java 方案**

#### 支持格式

- 1000+ 种文件格式
- 包括：PDF, Office, HTML, XML, 图片, 音频, 视频, 压缩包等

#### 使用方式

```python
# Python 客户端
from tika import parser

parsed = parser.from_file("document.pdf")
print(parsed["content"])  # 文本内容
print(parsed["metadata"])  # 元数据
```

#### Docker 部署

```bash
docker run -d -p 9998:9998 apache/tika
```

---

### 3. LlamaParse

**专为 LLM/RAG 优化的解析服务**

#### 特点

- 输出 Markdown 格式，直接适合 LLM 消费
- 支持表格、图片、公式解析
- 高质量 OCR
- 支持复杂布局

#### 使用

```python
from llama_parse import LlamaParse

parser = LlamaParse(
    result_type="markdown",  # 输出 Markdown
    num_workers=4,
    verbose=True
)

documents = parser.load_data("document.pdf")
```

---

### 4. Docling（IBM）

**企业级多模态文档解析**

#### 特点

- 支持 PDF, DOCX, HTML, 图片
- 保留文档结构和布局
- 表格和图片提取
- 多语言支持

#### 使用

```python
from docling.document_converter import DocumentConverter

converter = DocumentConverter()
result = converter.convert("document.pdf")

# 输出结构化文档
print(result.document.export_to_markdown())
```

---

### 5. Marker

**高质量 PDF/EPUB 转 Markdown**

#### 特点

- 保留标题层级
- 提取表格并转为 Markdown 表格
- 处理图片和公式
- 支持扫描件 OCR

#### 使用

```python
from marker.converters.pdf import PdfConverter

converter = PdfConverter(artifact_dict={"model": model})
rendered = converter("document.pdf")
print(rendered.markdown)  # 输出 Markdown
```

---

### 6. 云服务方案

#### Azure Document Intelligence

```python
from azure.ai.documentintelligence import DocumentIntelligenceClient

client = DocumentIntelligenceClient(endpoint, credential)
poller = client.begin_analyze_document("prebuilt-read", document)
result = poller.result()

for page in result.pages:
    for line in page.lines:
        print(line.content)
```

#### AWS Textract

```python
import boto3

textract = boto3.client("textract")
response = textract.detect_document_text(
    Document={"S3Object": {"Bucket": "bucket", "Name": "document.pdf"}}
)

for block in response["Blocks"]:
    if block["BlockType"] == "LINE":
        print(block["Text"])
```

---

## 当前 TS 实现

### 使用的库

| 格式 | 库 | 版本 | 功能 |
|------|-----|------|------|
| PDF | pdf-parse | - | 基础文本提取 |
| DOCX | mammoth | - | 纯文本提取 |
| Excel | exceljs | - | 行列文本提取 |
| 图片 OCR | tesseract.js | v7.0.0 | 本地 OCR（WASM） |

### 核心代码结构

```typescript
// attachment.parser.ts
export async function parseAttachment(input: {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  ocrLang?: string;
}): Promise<ParsedAttachment> {
  // 根据 contentType 分发到不同解析器
  if (contentType.includes("pdf")) return parsePdf(buffer);
  if (contentType.includes("wordprocessingml.document")) return parseDocx(buffer);
  if (contentType.includes("spreadsheetml.sheet")) return parseExcel(buffer);
  if (contentType.startsWith("image/")) return parseImageByOcr(buffer);
  // ...
}
```

### Chunking 策略

```typescript
// 按段落 + 固定字符数切分
export function chunkText(text: string, maxChunkChars = 1200) {
  const paragraphs = splitByParagraph(text);
  // 合并小段落，拆分大段落
  // ...
}
```

---

## TS vs Python 生态对比

### PDF 解析

| 维度 | pdf-parse (TS) | PyMuPDF / pdfplumber (Python) |
|------|----------------|------------------------------|
| 文本提取 | ✅ 基础支持 | ✅ 完整支持 |
| 表格提取 | ❌ 不支持 | ✅ 结构化提取 |
| 布局保留 | ❌ 丢失 | ✅ 保留位置信息 |
| 图片提取 | ❌ 不支持 | ✅ 支持 |
| 扫描件 OCR | ❌ 不支持 | ✅ 可集成 OCR |
| 性能 | 快 | 中等 |

**Python 优势**：
- `pdfplumber` 可以提取表格并转换为 DataFrame
- `PyMuPDF` 可以保留文本位置信息，用于布局分析
- 支持提取图片和注释

### DOCX 解析

| 维度 | mammoth (TS) | python-docx (Python) |
|------|--------------|----------------------|
| 文本提取 | ✅ 支持 | ✅ 支持 |
| 样式保留 | ❌ 丢失 | ✅ 保留（加粗、斜体等） |
| 表格结构 | ❌ 转为纯文本 | ✅ 结构化提取 |
| 列表层级 | ❌ 丢失 | ✅ 保留层级关系 |
| 图片提取 | ❌ 不支持 | ✅ 支持 |

**Python 优势**：
- 可以遍历段落、表格、列表的层级结构
- 保留样式信息用于上下文理解
- 支持提取嵌入的图片

### Excel 解析

| 维度 | exceljs (TS) | pandas + openpyxl (Python) |
|------|--------------|---------------------------|
| 读取单元格 | ✅ 支持 | ✅ 支持 |
| 数据类型 | 字符串 | DataFrame（结构化） |
| 公式计算 | ❌ 不支持 | ✅ 支持 |
| 多 Sheet | ✅ 支持 | ✅ 支持 |
| 数据分析 | 需手动处理 | ✅ 内置分析函数 |

**Python 优势**：
- 直接输出 DataFrame，便于后续处理
- 支持复杂的数据类型（日期、数字、布尔）
- 可以进行数据聚合和统计

### OCR

| 维度 | tesseract.js (TS) | PaddleOCR / EasyOCR (Python) |
|------|-------------------|------------------------------|
| 中文识别 | ⚠️ 质量差 | ✅ 准确率高 |
| 速度 | 慢（WASM） | 快（GPU 加速） |
| 布局分析 | ❌ 不支持 | ✅ 支持 |
| 表格识别 | ❌ 不支持 | ✅ 支持 |
| 手写体 | ❌ 不支持 | ✅ 部分支持 |

**Python 优势**：
- PaddleOCR 中文识别准确率远超 tesseract
- 支持版面分析，识别标题、段落、表格区域
- 支持表格结构识别

### Chunking 策略

| 维度 | 当前 TS 实现 | langchain / llama_index (Python) |
|------|-------------|----------------------------------|
| 切分方式 | 按段落 + 固定字符数 | 多种策略可选 |
| 语义分割 | ❌ 不支持 | ✅ 按语义相似度 |
| 递归分割 | ❌ 不支持 | ✅ 按层级递归 |
| Token 计数 | 简单估算 | ✅ 精确计算 |
| 重叠窗口 | ❌ 不支持 | ✅ 支持 |

**Python 策略示例**：

```python
# 1. 递归字符分割
from langchain.text_splitter import RecursiveCharacterTextSplitter
splitter = RecursiveCharacterTextSplitter(
    chunk_size=1200,
    chunk_overlap=200,
    separators=["\n\n", "\n", "。", "！", "？", ".", " "]
)

# 2. Markdown 标题分割
from langchain.text_splitter import MarkdownHeaderTextSplitter
headers_to_split_on = [("#", "Header 1"), ("##", "Header 2")]

# 3. 语义分割
from langchain_experimental.text_splitter import SemanticChunker
splitter = SemanticChunker(embeddings)
```

---

## 业内更好的方案

### 1. 专用文档解析服务

| 方案 | 类型 | 特点 | 适用场景 |
|------|------|------|----------|
| **Unstructured.io** | 开源 + SaaS | 支持 20+ 格式，保留布局 | 通用文档处理 |
| **LlamaParse** | SaaS | 专为 RAG 优化 | LlamaIndex 生态 |
| **Docling** | 开源 | IBM 出品，多模态 | 企业级应用 |
| **Apache Tika** | 开源 | Java 生态，格式最全 | 格式兼容性 |

**Unstructured.io 示例**：

```python
from unstructured.partition.pdf import partition_pdf

elements = partition_pdf("example.pdf")
for element in elements:
    print(f"Type: {element.category}")
    print(f"Text: {element.text}")
    # 输出: Type: Title, Table, NarrativeText, etc.
```

### 2. 多模态大模型直接理解

**优势**：跳过传统解析，直接理解复杂排版、图表、公式

```typescript
// 不再提取文本，直接让 VLM 理解文档
const result = await visionModel.invoke({
  messages: [{
    role: "user",
    content: [
      { type: "image_url", image_url: { url: pdfAsImage } },
      { type: "text", text: "请提取这份文档的核心内容，保留表格结构" }
    ]
  }]
});
```

**适用场景**：
- 扫描件 PDF
- 复杂排版文档
- 包含图表的文档
- 手写体识别

### 3. 混合策略（实践最优）

```
文档上传
  ↓
├─ 简单文本 → 直接解析（当前方式）
├─ 复杂 PDF → 调用 Unstructured/LlamaParse
├─ 扫描件/PPT → VLM 多模态理解
└─ 结构化数据 → 专用解析（Excel → DataFrame）
```

---

## 升级路径建议

### 短期（1-2 周）

1. **修复当前问题**
   - ✅ tesseract.js ESM 兼容（已完成）
   - ✅ ExcelJS RichText 处理（已完成）
   - ⏳ 配置 Embedding 服务

2. **改进 OCR 质量**
   - 集成百度 OCR API（免费额度）
   - 或使用多模态 VLM

### 中期（1-2 月）

1. **Python 解析微服务**
   ```typescript
   // TS 后端调用 Python 解析服务
   const { text, chunks } = await fetch('http://python-parser:8080/parse', {
     method: 'POST',
     body: formData
   });
   ```

2. **集成 Unstructured.io**
   - 自部署开源版
   - 支持更多文档格式

### 长期（3+ 月）

1. **VLM 直接理解**
   - 跳过传统解析
   - 直接理解复杂文档

2. **智能 Chunking**
   - 语义分割
   - 按标题层级
   - 父子 Chunk 策略

---

## 性能与成本对比

| 方案 | 解析速度 | 准确率 | 部署成本 | API 成本 |
|------|----------|--------|----------|----------|
| 当前 TS 方案 | 快 | 中 | 低 | 无 |
| Python 生态 | 中 | 高 | 中 | 无 |
| Unstructured.io | 中 | 高 | 中 | 免费/SaaS |
| VLM 直接理解 | 慢 | 最高 | 低 | 按 token 计费 |
| 百度/阿里 OCR | 快 | 高 | 低 | 按次数计费 |

---

## 推荐方案

### 个人项目 / 小团队

```
短期: 百度 OCR API + 当前 TS 解析
中期: 保持 TS，优化 Chunking 策略
```

### 中大型项目

```
短期: Python 解析微服务 + PaddleOCR
中期: 集成 Unstructured.io
长期: VLM 直接理解（成本下降后）
```

### RAG 优先场景

```
LlamaParse（专为 RAG 优化）
+ 语义 Chunking
+ 父子 Chunk 策略
```

---

## 相关资源

- [Unstructured.io 文档](https://unstructured-io.github.io/unstructured/)
- [LlamaParse 文档](https://docs.cloud.llamaindex.ai/)
- [PaddleOCR GitHub](https://github.com/PaddlePaddle/PaddleOCR)
- [LangChain Text Splitters](https://python.langchain.com/docs/modules/data_connection/document_transformers/)
