import { createBrowserClient } from "@supabase/ssr";

// 모듈 레벨 싱글톤. 이전엔 createClient() 가 매 호출마다 새 브라우저
// 클라이언트를 만들고, 그 안에서 JWT 파싱 + auth listener 등록 + 채널
// 매니저 초기화가 일어나서 useRealtimeInbox / usePresence 가 mount 될 때마다
// 20~50ms 의 메인 스레드 비용이 누적됐음. 한 세션에 하나만 만들어 재사용.
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (_client) return _client;
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  return _client;
}
