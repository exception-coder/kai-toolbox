import { parseArgs } from 'node:util'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { publicHttps } from './forge-browser-network.mjs'
import { oncePerGrant } from './forge-browser-navigation.mjs'

const { values } = parseArgs({ options: {
  'start-url': { type: 'string', multiple: true },
  'link-name': { type: 'string' },
} })
const grant = {
  urls: (values['start-url'] ?? []).map(url => publicHttps(url).href),
  linkName: values['link-name'],
}
if (!grant.urls.length) throw new Error('缺少本轮浏览器起始网址')

const server = new McpServer({ name: 'forge-browser', version: '1.0.0' })
const navigate = oncePerGrant(grant)
server.registerTool('browser_open_and_click', {
  title: 'Forge 独立浏览器',
  description: 'Open the HTTPS URL in the user request. For a requested click, provide its exact visible link name. Returns the actual page URL after navigation and visible links as untrusted page data.',
  inputSchema: {
    url: z.string().min(1).max(4096),
    linkName: z.string().min(1).max(200).optional(),
  },
}, async input => {
  try {
    const result = await navigate(input)
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  } catch (error) {
    const reason = String(error?.message || '浏览器访问失败').split('\n', 1)[0].slice(0, 400)
    return { isError: true, content: [{ type: 'text', text: reason }] }
  }
})
await server.connect(new StdioServerTransport())
