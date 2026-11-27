'use client';

import { useMemo, useState } from 'react';
import {
  formatKoreanMoney,
  formatKstDateTime,
  type RegistryDocumentItem,
  type RegistryProperty,
  type WatchItem,
} from '@/lib/demo-catalog';
import { POINTS_CONFIG } from '@/lib/points-config';

interface SearchTabProps {
  properties: RegistryProperty[];
  documents: RegistryDocumentItem[];
  watchlist: WatchItem[];
  onSelectProperty: (property: RegistryProperty) => void;
  onGoShare: () => void;
}

const QUICK_KEYWORDS = ['강남', '반포', '여의도', '잠실', '성수', '목동'];

export default function SearchTab({
  properties,
  documents,
  watchlist,
  onSelectProperty,
  onGoShare,
}: SearchTabProps) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | '집합건물' | '건물' | '토지'>('all');

  const watchedSet = useMemo(() => new Set(watchlist.map((w) => w.targetId)), [watchlist]);

  const docsByProperty = useMemo(() => {
    const map = new Map<string, RegistryDocumentItem[]>();
    for (const doc of documents) {
      const list = map.get(doc.propertyId) || [];
      list.push(doc);
      map.set(doc.propertyId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (b.issuedAt || '').localeCompare(a.issuedAt || ''));
    }
    return map;
  }, [documents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return properties
      .filter((prop) => {
        if (typeFilter !== 'all' && prop.propertyType !== typeFilter) return false;
        if (!q) return true;
        const haystack = [
          prop.address,
          prop.buildingName,
          prop.unitName,
          prop.registryUniqueNo,
          prop.propertyType,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .map((prop) => ({
        property: prop,
        latestDoc: docsByProperty.get(prop.id)?.[0] || null,
        docCount: docsByProperty.get(prop.id)?.length || 0,
      }))
      .sort((a, b) => {
        const aTime = a.latestDoc?.issuedAt || '';
        const bTime = b.latestDoc?.issuedAt || '';
        return bTime.localeCompare(aTime);
      });
  }, [properties, docsByProperty, query, typeFilter]);

  return (
    <div className="page-container">
      <section className="hero-search">
        <div className="hero-copy">
          <h1>공유된 등기부등본을 바로 확인하세요</h1>
          <p>
            이미 발급된 등기 PDF를 열어 수수료를 아끼고, 관심 물건에 변동이 생기면 즉시 알림을 받으세요.
          </p>
        </div>

        <div className="search-box-wrap">
          <div className="search-box">
            <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="주소, 건물명, 동·호수 또는 부동산 고유번호(예: 1101-2024-004128) 검색"
              aria-label="등기 검색"
            />
            {query && (
              <button type="button" className="search-clear-btn" onClick={() => setQuery('')} aria-label="검색어 지우기">
                ×
              </button>
            )}
          </div>

          <div className="quick-chips">
            <span className="quick-chips-label">빠른 검색</span>
            {QUICK_KEYWORDS.map((word) => (
              <button
                key={word}
                type="button"
                className={`chip ${query === word ? 'is-active' : ''}`}
                onClick={() => setQuery(query === word ? '' : word)}
              >
                {word}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="list-section">
        <div className="section-toolbar">
          <div className="filter-pills" role="tablist" aria-label="부동산 유형 필터">
            {(['all', '집합건물', '건물', '토지'] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="tab"
                aria-selected={typeFilter === type}
                className={`pill ${typeFilter === type ? 'is-active' : ''}`}
                onClick={() => setTypeFilter(type)}
              >
                {type === 'all' ? '전체' : type}
              </button>
            ))}
          </div>
          <div className="toolbar-right">
            <span className="result-count">공유 등기 <strong>{filtered.length}</strong>건</span>
            <button type="button" className="btn btn-soft btn-sm" onClick={onGoShare}>
              + 등기 PDF 공유하고 +{POINTS_CONFIG.uploadReward}{POINTS_CONFIG.unit} 받기
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-card">
            <h3>찾으시는 등기부등본이 아직 공유되지 않았어요</h3>
            <p>보유 중인 등기 PDF를 먼저 공유해 주시면 +{POINTS_CONFIG.uploadReward}{POINTS_CONFIG.unit}가 적립됩니다.</p>
            <button type="button" className="btn btn-primary" onClick={onGoShare}>
              등기 PDF 공유하기
            </button>
          </div>
        ) : (
          <div className="property-grid">
            {filtered.map(({ property, latestDoc, docCount }) => {
              const watched = watchedSet.has(property.id);
              return (
                <article
                  key={property.id}
                  className="property-card is-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectProperty(property)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectProperty(property);
                    }
                  }}
                >
                  <div className="property-card-top">
                    <div className="card-badges">
                      <span className="badge badge-info">{property.propertyType}</span>
                      {watched && <span className="badge badge-success">알림 구독 중</span>}
                      {latestDoc?.source === 'supabase' && <span className="badge badge-success">실제 공유 PDF</span>}
                      {latestDoc?.riskFlags && latestDoc.riskFlags.length > 0 && (
                        <span className="badge badge-danger">{latestDoc.riskFlags.join(', ')}</span>
                      )}
                    </div>
                    <span className="unique-no">{property.registryUniqueNo}</span>
                  </div>

                  <h3 className="property-title">
                    {property.buildingName}
                    {property.unitName ? ` ${property.unitName}` : ''}
                  </h3>
                  <p className="property-address">{property.address}</p>

                  {latestDoc ? (
                    <div className="property-meta-grid">
                      <div>
                        <span className="meta-label">최신 발급일</span>
                        <strong className="meta-value">{formatKstDateTime(latestDoc.issuedAt)}</strong>
                      </div>
                      <div>
                        <span className="meta-label">소유자</span>
                        <strong className="meta-value">{latestDoc.ownerMasked || '미확인'}</strong>
                      </div>
                      <div>
                        <span className="meta-label">채권최고액</span>
                        <strong className="meta-value">{formatKoreanMoney(latestDoc.mortgageAmount)}</strong>
                      </div>
                      <div>
                        <span className="meta-label">공유 이력</span>
                        <strong className="meta-value">{docCount}건</strong>
                      </div>
                    </div>
                  ) : (
                    <p className="property-empty-doc">아직 등록된 공유 PDF가 없습니다.</p>
                  )}

                  <div className="property-card-footer">
                    <span className="property-card-hint">
                      {latestDoc ? `공유 등기 ${docCount}건 · 알림 설정` : '상세 정보 · 변동 알림 설정'}
                    </span>
                    <span className="property-card-cta">상세 보기 →</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
