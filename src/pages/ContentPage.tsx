import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TopBar } from "../components/TopBar";

// Renders an in-app content/legal page from bundled markdown, styled on-brand.
export function ContentPage({ title, markdown, draft }: { title: string; markdown: string; draft?: boolean }) {
  return (
    <div className="min-h-screen pb-12">
      <TopBar title={title} />
      <article className="px-5 pt-3">
        {draft && (
          <p className="t-caption mb-4 rounded-input bg-warning/10 p-3 text-warning">
            Draft — this document is pending review by a qualified UK solicitor before publication.
          </p>
        )}
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="t-h1 mb-3 mt-5 first:mt-0">{children}</h1>,
            h2: ({ children }) => <h2 className="t-h2 mb-2 mt-6">{children}</h2>,
            h3: ({ children }) => <h3 className="t-h3 mb-2 mt-5">{children}</h3>,
            p: ({ children }) => <p className="t-body mb-3 text-grey-700">{children}</p>,
            ul: ({ children }) => <ul className="mb-3 list-disc space-y-1.5 pl-5 text-grey-700">{children}</ul>,
            ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-grey-700">{children}</ol>,
            li: ({ children }) => <li className="t-body">{children}</li>,
            a: ({ children, href }) => (
              <a href={href} className="text-teal-700 underline">
                {children}
              </a>
            ),
            strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
            blockquote: ({ children }) => (
              <blockquote className="my-3 border-l-2 border-teal-300 pl-4 italic text-grey-500">{children}</blockquote>
            ),
            hr: () => <hr className="my-5 border-grey-100" />,
            code: ({ children }) => <code className="rounded bg-grey-100 px-1.5 py-0.5 text-[13px]">{children}</code>,
            table: ({ children }) => (
              <div className="mb-3 overflow-x-auto">
                <table className="w-full border-collapse text-left text-[14px]">{children}</table>
              </div>
            ),
            th: ({ children }) => <th className="border-b border-grey-200 py-2 pr-3 font-semibold">{children}</th>,
            td: ({ children }) => <td className="border-b border-grey-100 py-2 pr-3 text-grey-700">{children}</td>,
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
