'use client';

import { useEffect } from 'react';
import { mountDeunggiroApp } from '@/lib/client-app';

export default function DeunggiroApp({ initialPage = 'map' }: { initialPage?: string }) {
  useEffect(() => {
    return mountDeunggiroApp(initialPage);
  }, [initialPage]);

  return (
    <>
      <div id="route-progress" className="route-progress" aria-hidden="true"></div>
      <header className="site-header">
        <div className="header-brand">
          <a className="brand-link" href="/" aria-label="등기로 홈">
            <img src="/assets/images/logo.png" width={108} height={47} alt="등기로" />
          </a>
          <span className="environment-label">등기로 Beta</span>
        </div>
        <nav aria-label="주요 메뉴" className="navigation">
          <button type="button" data-action="page" data-id="map" aria-current="page">등기 찾기</button>
          <button type="button" data-action="page" data-id="guide">이용 가이드</button>
          <button type="button" data-action="page" data-id="watch" data-auth-only="" hidden>관심 부동산</button>
          <button type="button" data-action="page" data-id="alerts" data-auth-only="" hidden>
            알림<span id="unread-count" hidden></span>
          </button>
          <button type="button" className="nav-account" data-action="page" data-id="profile" data-auth-only="" hidden>
            내 정보
          </button>
          <button type="button" id="nav-auth" className="nav-account" data-action="page" data-id="login" hidden>
            로그인
          </button>
        </nav>
      </header>

      <div id="mode-switcher" className="mode-switcher" role="tablist" aria-label="탐색 모드 전환">
        <button type="button" role="tab" data-action="page" data-id="map" aria-selected="true" className="is-active">
          지도 검색
        </button>
        <button type="button" role="tab" data-action="page" data-id="search" aria-selected="false">
          간편 검색
        </button>
      </div>

      <main id="map-page" className="map-workspace">
        <section className="map-stage" aria-label="위치 지도">
          <div id="map-live" className="map-layer" hidden></div>
          <div id="map-demo" className="map-layer">
            <canvas aria-hidden="true"></canvas>
            <div id="demo-pins" className="pin-layer"></div>
          </div>
          <p id="map-mode" className="map-mode" role="status">검증용 지도</p>
          <div className="map-tools" aria-label="지도 조작">
            <div className="zoom-group">
              <button type="button" data-action="zoom-in" aria-label="지도 확대">+</button>
              <button type="button" data-action="zoom-out" aria-label="지도 축소">−</button>
            </div>
            <button type="button" data-action="map-reset" aria-label="기본 지도 위치로 이동">
              <span className="icon icon-locate" aria-hidden="true"></span>
            </button>
            <div className="layer-group" aria-label="지도 레이어">
              <button type="button" id="toggle-satellite" data-action="toggle-satellite" aria-pressed="false" title="위성지도 전환">
                위성
              </button>
              <button type="button" id="toggle-cadastral" data-action="toggle-cadastral" aria-pressed="false" title="지적편집도 표시">
                지적
              </button>
            </div>
          </div>
          <div id="map-breadcrumb" className="map-breadcrumb" aria-live="polite"></div>
          <div id="map-caption" className="map-caption">검증용 지도 · 실제 지형과 다를 수 있어요</div>
        </section>

        <aside className="map-overlay" aria-label="지도 검색과 등기 상세">
          <div className="floating-search">
            <h1 className="sr-only">지도에서 등기 찾기</h1>
            <form id="search-form" className="search-form" role="search">
              <span className="search-leading" aria-hidden="true">
                <span className="icon icon-search"></span>
              </span>
              <label htmlFor="search-query" className="sr-only">주소·지번·건물명</label>
              <input
                id="search-query"
                type="search"
                placeholder="주소, 지번, 건물명으로 등기 찾기"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="false"
                aria-controls="search-suggest"
              />
              <button type="button" id="search-clear" className="search-clear" data-action="clear-search" aria-label="검색어 지우기" hidden>
                ×
              </button>
              <button type="submit" className="search-submit" aria-label="검색">검색</button>
            </form>
            <div id="search-suggest" className="search-suggest" role="listbox" aria-label="추천 검색어" hidden></div>
            <p id="search-feedback" className="search-feedback" role="status" hidden></p>
            <div id="quick-tray" className="quick-tray">
              <div id="popular-bar" className="quick-section" aria-label="인기 주소"></div>
              <div id="recent-bar" className="quick-section quick-section-recent" aria-label="최근 본 부동산" hidden></div>
            </div>
          </div>
          <section id="results-panel" className="results-panel" aria-label="검색 결과 및 등기 상세" data-open="true"></section>
        </aside>

        <button
          type="button"
          id="drawer-toggle"
          className="drawer-toggle"
          data-action="drawer-toggle"
          aria-label="좌측 패널 열기"
          aria-expanded="false"
          aria-controls="results-panel"
        >
          <span className="drawer-arrow" aria-hidden="true"></span>
        </button>
      </main>

      <main id="sub-page" className="sub-page" hidden></main>

      <button type="button" id="fab-auto-upload" className="fab-auto-upload" data-action="auto-upload" aria-label="등기 파일 자동 등록">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M4 20h16" />
        </svg>
        <span>등기 자동 등록</span>
      </button>

      <dialog id="action-dialog" aria-labelledby="dialog-title"></dialog>
      <div id="toast" className="toast" role="status" aria-live="polite" hidden></div>
    </>
  );
}
