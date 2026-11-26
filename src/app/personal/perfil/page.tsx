"use client";
import Shell from "../../../components/Shell";
import ProfileForm from "../../../components/ProfileForm";
import { useMe } from "../../../lib/client";

export default function Perfil() {
  const { me, logout } = useMe("trainer");
  return (
    <Shell me={me} logout={logout}>
      <h1>Meu perfil</h1>
      {me && <ProfileForm me={me} />}
    </Shell>
  );
}
