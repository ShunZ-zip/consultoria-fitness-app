/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  agentRules: false,
  // Testar no celular pela rede local (Wi-Fi): libera os arquivos do servidor de DESENVOLVIMENTO para aparelhos da rede privada.
  // Só vale com `npm run dev`; não afeta a versão de produção.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*", "172.17.*.*", "172.18.*.*", "172.19.*.*", "172.2*.*.*", "172.30.*.*", "172.31.*.*", "*.local"],
};
export default nextConfig;
