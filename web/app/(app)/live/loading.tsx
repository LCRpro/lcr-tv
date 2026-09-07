import { SkeletonCatalogue } from '../../../components/ui';

/** Repli instantané pendant que la route se charge — voir `films/loading.tsx`. */
export default function Loading() {
  return <SkeletonCatalogue kind="channel" />;
}
