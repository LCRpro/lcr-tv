/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Le serveur de dev et le build de production ecrivent tous deux dans .next :
  // lancer un build pendant que le dev tourne remplace ses chunks, et le
  // navigateur se retrouve a demander des fichiers qui n'existent plus (page
  // blanche, 404 sur /_next/static). On les separe.
  distDir: process.env.NODE_ENV === 'production' ? '.next-build' : '.next',
  // Les types partages sont consommes depuis leur build (packages/shared/dist).
  transpilePackages: ['@iptv/shared'],
  images: {
    // Les visuels viennent du panel : hotes inconnus a l'avance, et souvent en
    // http. On sert donc les images telles quelles, sans optimisation Next.
    unoptimized: true,
  },
};

export default nextConfig;
