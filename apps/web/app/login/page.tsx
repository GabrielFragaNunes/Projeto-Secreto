import LoginForm from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith('/') && !params.next.startsWith('//')
    ? params.next
    : '/';

  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-lg place-items-center px-4 py-10">
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
