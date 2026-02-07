export function AdminAccessDenied() {
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
      You do not have access to this section. Please contact a Super admin to update your role.
    </div>
  );
}
