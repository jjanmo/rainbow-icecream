import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async () => {
  return { redirect: { destination: "/setup", permanent: false } };
};

export default function IndexPage() {
  return null;
}
