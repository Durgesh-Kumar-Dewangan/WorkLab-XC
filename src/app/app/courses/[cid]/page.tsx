import type { Metadata } from 'next';
import { CourseOverviewPage } from '@/components/app/pages/CourseOverviewPage';

export const metadata: Metadata = { title: 'Course' };
export default async function Page({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return <CourseOverviewPage cid={cid} />;
}
