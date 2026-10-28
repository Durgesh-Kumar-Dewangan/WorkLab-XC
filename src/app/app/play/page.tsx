import { redirect } from 'next/navigation';

/** Play moved: the points, streak and league live on the Leaderboard, and the rounds are in Learn and Practice. */
export default function Page() {
  redirect('/app/leaderboard');
}
