export type ScopeMembership = { organization_id: string; organizations: { scope_kind: string; personal_owner: string | null } };
export function selectWorkspace<T extends ScopeMembership>(memberships: T[], userId: string, selected?: string) {
  const personal = memberships.find(m => m.organizations?.scope_kind === "personal" && m.organizations.personal_owner === userId);
  const organizations = memberships.filter(m => m.organizations?.scope_kind === "organization");
  const member = selected === "personal" ? personal : selected ? organizations.find(m => m.organization_id === selected) : organizations[0] || personal;
  return { personal, organizations, member };
}
