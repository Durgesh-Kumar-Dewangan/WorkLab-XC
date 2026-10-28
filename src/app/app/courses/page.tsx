import { redirect } from 'next/navigation';

/** The list of courses is now a view inside Learn. */
export default function Page() {
  redirect('/app/learn?view=courses');
}
