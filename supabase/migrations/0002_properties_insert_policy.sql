-- 인증된 회원이 실제 PDF 업로드 시 부동산 메타데이터(properties)를 등록/갱신할 수 있도록 허용
drop policy if exists "properties_auth_insert" on public.properties;
create policy "properties_auth_insert" on public.properties
  for insert to authenticated with check (true);

drop policy if exists "properties_auth_update" on public.properties;
create policy "properties_auth_update" on public.properties
  for update to authenticated using (true) with check (true);
