type InfoPageProps = {
  title: string;
  text: string;
};

export function InfoPage({ title, text }: InfoPageProps) {
  return (
    <section className="info-page">
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}
