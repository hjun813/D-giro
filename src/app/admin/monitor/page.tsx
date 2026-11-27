import Link from 'next/link';
import RegistryMonitorAdmin from '@/components/RegistryMonitorAdmin';
import { getRegistryMonitorAdmin } from '@/lib/monitor/access.server';

export const dynamic = 'force-dynamic';

export default async function RegistryMonitorPage() {
  const admin = await getRegistryMonitorAdmin();

  return (
    <main className="page-container registry-monitor-page">
      <header className="page-head">
        <div>
          <h1>등기변동 조회 결과 등록</h1>
          <p>인터넷등기소에서 확인한 신청사건을 반영하고 구독자에게 앱 알림을 보냅니다.</p>
        </div>
        <Link href="/" className="btn btn-secondary">등기로 홈</Link>
      </header>
      {admin.status === 200 ? <RegistryMonitorAdmin /> : (
        <section className="card-panel" aria-label="관리 화면 접근 안내">
          <p>{admin.message}</p>
          {admin.status === 401 && <Link href="/login" className="btn btn-primary">로그인</Link>}
        </section>
      )}
    </main>
  );
}
