import { ArrowRight, ArrowUp, Asterisk, Check, Cloud, Inbox, Search, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Brand } from './components/Brand';
import { ListDot } from './components/ListDot';
import { Button } from './components/ui/button';

const features = [
  {
    Icon: Inbox,
    step: '01 — LET IT OUT',
    title: 'One box. Anything goes.',
    body: 'Thoughts, links, to-dos, or a sentence that isn’t quite an idea yet. No form to fill out. Just get it down.',
  },
  {
    Icon: Sparkles,
    step: '02 — LET IT SORT ITSELF',
    title: 'It finds its own place.',
    body: 'Dump reads each new thought and files it into the list that fits: Ideas, Buy, Watch, or your own. Not sure? It goes to To do. Move anything yourself and your choice wins.',
  },
  {
    Icon: Cloud,
    step: '03 — COME BACK TO IT',
    title: 'Here when you need it.',
    body: 'Search for the thought you almost forgot. Capture offline on a previously loaded device, and sync when you’re back.',
  },
];

export default function Marketing() {
  return (
    <div className="mx-auto max-w-320 px-15 max-tablet:px-8 max-phone:px-5.5">
      <header className="flex h-26.25 items-center justify-between gap-5 max-phone:h-20.5">
        <Link to="/marketing" aria-label="About Dump">
          <Brand className="max-phone:text-[26px]" />
        </Link>
        <a href="#how-it-works" className="text-[11px] text-muted-foreground max-phone:hidden">
          A little less on your mind
        </a>
        <Button
          asChild
          variant="outline"
          className="text-[11px] max-phone:px-2.5 max-phone:py-2 max-phone:text-[10px]"
        >
          <Link to="/">
            Open your space
            <ArrowRight />
          </Link>
        </Button>
      </header>
      <main>
        <section className="pt-20.75 pb-14.5 text-center max-phone:pt-14 max-phone:pb-10">
          <div className="inline-flex items-center gap-2.25 text-[9px] tracking-[1.7px] text-muted-foreground max-phone:text-[7px] max-phone:tracking-[1px]">
            <span className="size-1.5 rounded-full bg-primary" />
            FOR THOUGHTS THAT NEED SOMEWHERE TO GO
          </div>
          <h1 className="mt-6.25 mb-5.5 text-[clamp(36px,4.7vw,63px)] leading-[1.15] font-[490] tracking-[-2.8px] max-phone:text-[38px] max-phone:tracking-[-1.8px]">
            Your mind is for ideas.
            <br />
            <span className="text-accent-foreground">Not holding onto them.</span>
          </h1>
          <p className="mb-7.25 text-[14px] leading-[1.9] text-muted-foreground max-phone:text-[12px]">
            The book someone mentioned. A half-formed idea. That link for later.
            <br className="max-phone:hidden" /> Put it all in Dump. It files each one into the right
            list for you.
          </p>
          <Button asChild size="lg" className="px-5.5 py-6 text-[12px] has-[>svg]:px-5.5">
            <Link to="/">
              A little more headspace
              <ArrowRight />
            </Link>
          </Button>
          <small className="mt-3.75 block text-[10px] text-muted-foreground">
            Capture first. Dump does the sorting.
          </small>
        </section>
        <section
          className="mx-auto max-w-217.5 overflow-hidden rounded-[16px] border bg-sidebar shadow-[0_20px_70px_#51416a0b]"
          aria-label="Illustration of Dump with example thoughts"
        >
          <div className="flex items-center justify-between border-b px-6 py-4.5 text-[11px] text-muted-foreground max-phone:px-4.25 max-phone:py-3.5">
            <span className="flex items-center gap-2.25">
              <Asterisk size={18} />
              My little corner
            </span>
            <Search size={16} />
          </div>
          <div className="p-6.25 max-phone:p-4">
            <div className="mb-5.75 flex items-center gap-3 rounded-[9px] border border-input bg-capture p-5 text-[13px] text-accent-foreground max-phone:px-3 max-phone:py-4 max-phone:text-[11px]">
              <Asterisk size={24} />
              <span>What’s on your mind?</span>
              <ArrowUp size={20} className="ml-auto" />
            </div>
            <div className="grid grid-cols-3 gap-4 max-phone:grid-cols-2 max-phone:gap-2.5">
              {[
                {
                  name: 'Inbox',
                  color: '#a799b8',
                  items: [{ text: 'That film everyone keeps talking about', sorting: true }],
                },
                {
                  name: 'Ideas',
                  color: '#9b84d6',
                  items: [
                    { text: 'A tiny reading nook by the window', sorting: false },
                    { text: 'What if the best ideas happen on a walk?', sorting: false },
                  ],
                },
                {
                  name: 'Watch',
                  color: '#6395c3',
                  items: [
                    { text: 'The documentary about the lighthouse keeper', sorting: false },
                    { text: 'Rewatch the one with the train at the end', sorting: false },
                  ],
                },
              ].map((column) => (
                <div key={column.name} className="max-phone:last:hidden">
                  <h2 className="mb-3.25 ml-1 flex items-center gap-1.75 text-[11px]">
                    <ListDot color={column.color} />
                    {column.name}
                    <span className="ml-auto text-[9px] text-muted-foreground">
                      {column.items.length}
                    </span>
                  </h2>
                  {column.items.map((item) => (
                    <div
                      className="mb-2.5 rounded-[9px] border bg-card px-3.25 py-4.25 text-[12px] leading-[1.65] max-phone:px-2.5 max-phone:py-3 max-phone:text-[10px]"
                      key={item.text}
                    >
                      {item.text}
                      <small className="mt-3.75 flex items-center gap-1.25 text-[8px] text-muted-foreground max-phone:text-[7px]">
                        {item.sorting ? (
                          <>
                            <span className="size-1.5 rounded-full bg-ring motion-safe:animate-pulse" />
                            Sorting…
                          </>
                        ) : (
                          <>
                            <Sparkles size={9} />
                            Filed by Dump
                          </>
                        )}
                      </small>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 px-5 pb-4.75 text-[9px] text-muted-foreground">
            <Check size={12} />
            Example thoughts · your space starts empty
          </div>
        </section>
        <section
          className="grid grid-cols-3 gap-13.75 px-6.25 pt-25 pb-21.25 max-phone:grid-cols-1 max-phone:gap-8.25 max-phone:px-2.25 max-phone:py-14.25"
          id="how-it-works"
        >
          {features.map(({ Icon, step, title, body }) => (
            <div key={step}>
              <Icon size={23} className="mb-4.75 text-accent-foreground max-phone:mb-3.25" />
              <span className="text-[8px] tracking-[1.4px] text-muted-foreground">{step}</span>
              <h2 className="my-3 text-[19px] font-medium tracking-[-0.5px] max-phone:my-2">
                {title}
              </h2>
              <p className="text-[12px] leading-[1.9] text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
        <section className="border-t pt-16.25 pb-15 text-center max-phone:py-11.25">
          <Asterisk size={45} className="mx-auto text-accent-foreground" />
          <h2 className="my-5 text-[38px] leading-[1.3] font-[490] tracking-[-1.3px] max-phone:text-[32px]">
            Less to carry.
            <br />
            More room to think.
          </h2>
          <Button asChild>
            <Link to="/">
              Open Dump
              <ArrowRight />
            </Link>
          </Button>
          <p className="mt-5.75 text-[10px] leading-[1.8] text-muted-foreground">
            This is a personal project. The current deployment is public.
          </p>
        </section>
      </main>
      <footer className="flex items-center justify-between gap-5 border-t py-7.5 text-[10px] text-muted-foreground max-phone:flex-wrap max-phone:gap-3.75 max-phone:pb-[calc(25px+env(safe-area-inset-bottom))]">
        <Brand className="text-[22px]" markClassName="size-7" />
        <span className="max-phone:text-[9px]">Out of your head. Into your space.</span>
        <Link to="/">Back to your space ↗</Link>
      </footer>
    </div>
  );
}
