import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async () => {
  return { redirect: { destination: "/portfolio", permanent: false } };
};

export default function IndexPage() {
  return null;
}
