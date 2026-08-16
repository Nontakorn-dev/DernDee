revoke all on function public.touch_chat_thread_on_message() from public;
revoke all on function public.touch_chat_thread_on_message() from anon;
revoke all on function public.touch_chat_thread_on_message() from authenticated;

revoke all on function public.mark_chat_thread_read(uuid) from public;
revoke all on function public.mark_chat_thread_read(uuid) from anon;
grant execute on function public.mark_chat_thread_read(uuid) to authenticated;
