/** All built-ins in the pinned Qwen SDK 0.1.14. Safe mode excludes user plugins and MCP sources. */
export const QWEN_REVIEW_BLOCKED_TOOLS = [
  'exec', 'edit', 'write_file', 'read_file', 'zoom_image', 'grep_search', 'glob', 'run_shell_command',
  'todo_write', 'save_memory', 'agent', 'skill', 'exit_plan_mode', 'enter_plan_mode', 'web_fetch',
  'web_search', 'image_gen', 'list_directory', 'lsp', 'ask_user_question', 'cron_create', 'cron_list',
  'cron_delete', 'loop_wakeup', 'create_sub_session', 'list_agents', 'task_stop', 'task_create',
  'task_update', 'task_list', 'team_create', 'team_delete', 'team_plan_approval', 'request_shutdown',
  'send_message', 'structured_output', 'monitor', 'notebook_edit', 'tool_call', 'tool_search',
  'read_mcp_resource', 'enter_worktree', 'exit_worktree', 'workflow', 'artifact', 'record_artifact',
  'record_source', 'report_findings', 'get_goal', 'update_goal', 'omni_downsample_image',
  'omni_downscale_video', 'omni_downsample_audio', 'omni_extract_keyframes', 'omni_extract_audio',
  'omni_clip_video', 'omni_convert_image', 'omni_transcribe_audio', 'omni_clip_image', 'omni_clip_audio',
  'omni_caption_image', 'omni_caption_audio', 'omni_ocr_image', 'omni_understand_video_segments',
  'omni_recall_media_memory', 'propose_goal', 'display_image', 'mcp__*',
]
