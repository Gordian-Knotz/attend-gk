-- RLS fix, in the same family as 0003.
--
-- 0003 gave super_admin cross-org access on the sites *manage* policy but
-- left "sites: select in org" from 0001 untouched, so a super_admin could
-- write another org's sites yet not read them. Every other table on the
-- platform-overview page (organizations, employees) already allows the
-- cross-org read; this brings sites in line, per Section 06's "Super Admin:
-- full platform access: all organizations".

drop policy "sites: select in org" on sites;
create policy "sites: select in org" on sites for select
  using (
    (select role from public.current_employee()) = 'super_admin'
    or org_id = (select org_id from public.current_employee())
  );
