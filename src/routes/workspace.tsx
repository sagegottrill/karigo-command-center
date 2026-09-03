import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/workspace')({
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  return (
    <div className="workspace-boundary">
      <Outlet />
    </div>
  );
}
