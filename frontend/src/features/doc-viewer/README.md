# 文档浏览器

首页「直接打开文件」支持拖入文件，或点击选择文件后直接预览，无需挂载目录。支持 `.md`、`.markdown`、`.mdx`、`.html`、`.htm`、`.txt`、`.rst`、`.adoc`；一次最多 10 份，单份最多 5 MiB、合计最多 20 MiB。UTF-8 与带 BOM 的 UTF-16 文本可读取。

Markdown 沿用 Mermaid 和 h2–h6 大纲，MDX 按静态 Markdown 阅读；RST/ADOC 显示原文。可切换同批文件和源码，大文件默认显示源码。HTML 为隔离的静态单文件预览，内嵌样式可显示，脚本、表单和外部资源不执行。

临时文件只在当前浏览器内存中读取，不上传、不登记文档源、不修改原文件，关闭窗口即清除。需要关联图片、链接、完整 HTML 交互或保存编辑时，使用既有「添加本地目录」入口。GitHub 文档源仍为只读。

实现与验收范围见 [直接打开文件](../../../../openspec/changes/add-browser-file-preview/tasks.md)。
