interface AffiliateLinkProps {
  href: string;
  children: React.ReactNode;
}

export default function AffiliateLink({ href, children }: AffiliateLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="nofollow sponsored noopener"
      className="font-medium underline decoration-1 underline-offset-2 text-accent"
    >
      {children}
    </a>
  );
}
