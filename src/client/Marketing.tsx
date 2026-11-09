import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowRight, ArrowUp, Asterisk, Check, Cloud, Inbox, Search, Sparkles } from 'lucide-react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { Section } from '@astryxdesign/core/Section';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { TopNav } from '@astryxdesign/core/TopNav';
import { Brand } from './components/Brand';
import { ListDot } from './components/ListDot';
import { hasNotebook } from './registry';

const loadOnboarding = () => import('./components/Onboarding');
const Onboarding = lazy(loadOnboarding);

const features = [
  {
    icon: Inbox,
    title: 'One box. Anything goes.',
    body: 'Thoughts, links, to-dos, or a sentence that isn’t quite an idea yet. No form to fill out. Just get it down.',
  },
  {
    icon: Sparkles,
    title: 'It finds its own place.',
    body: 'Dump reads each new thought and files it into the list that fits: Ideas, Buy, Watch, or your own. Not sure? It goes to To do. Move anything yourself and your choice wins.',
  },
  {
    icon: Cloud,
    title: 'Here when you need it.',
    body: 'Search for the thought you almost forgot. Capture offline on a previously loaded device, and sync when you’re back.',
  },
];

const exampleLists = [
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
];

const arrow = <Icon icon={ArrowRight} size="sm" color="inherit" />;

// Returning visitors go straight to their notebook; new ones open onboarding in place. Every
// start button on the page carries the same label.
function Start({
  returning,
  onStart,
  variant = 'primary',
  size,
}: {
  returning: boolean;
  onStart: () => void;
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'lg';
}) {
  const label = returning ? 'Open your space' : 'Get started';
  return returning ? (
    <Button href="/" label={label} variant={variant} size={size} endContent={arrow} />
  ) : (
    <Button label={label} variant={variant} size={size} endContent={arrow} onClick={onStart} />
  );
}

function Illustration() {
  return (
    <Card
      padding={0}
      elevation="med"
      maxWidth={870}
      className="mx-auto w-full overflow-hidden"
      aria-label="Illustration of Dump with example thoughts"
      role="img"
    >
      <Section dividers={['bottom']} paddingInline={6} paddingBlock={4}>
        <HStack hAlign="between" vAlign="center">
          <HStack gap={2} vAlign="center">
            <Icon icon={Asterisk} size="sm" color="secondary" />
            <Text type="supporting">My little corner</Text>
          </HStack>
          <Icon icon={Search} size="sm" color="secondary" />
        </HStack>
      </Section>
      <VStack gap={5} padding={6} className="max-phone:p-3">
        <Card padding={4}>
          <HStack gap={3} vAlign="center">
            <Icon icon={Asterisk} color="accent" />
            <Text color="accent" size="sm">
              What’s on your mind?
            </Text>
            <Icon icon={ArrowUp} color="accent" className="ml-auto" />
          </HStack>
        </Card>
        <Grid columns={3} gap={4} className="max-phone:grid-cols-2 max-phone:gap-2.5">
          {exampleLists.map((list) => (
            <VStack gap={3} key={list.name} className="max-phone:last:hidden">
              <HStack gap={2} vAlign="center" paddingInlineStart={1}>
                <ListDot color={list.color} />
                <Text type="label">{list.name}</Text>
                <Text type="supporting" className="ml-auto">
                  {list.items.length}
                </Text>
              </HStack>
              {list.items.map((item) => (
                <Card key={item.text} padding={3}>
                  <VStack gap={3}>
                    <Text size="sm">{item.text}</Text>
                    <HStack gap={1.5} vAlign="center">
                      {item.sorting ? (
                        <>
                          <StatusDot variant="accent" label="Sorting" isPulsing />
                          <Text type="supporting" size="xsm">
                            Sorting…
                          </Text>
                        </>
                      ) : (
                        <>
                          <Icon icon={Sparkles} size="xsm" color="secondary" />
                          <Text type="supporting" size="xsm">
                            Filed by Dump
                          </Text>
                        </>
                      )}
                    </HStack>
                  </VStack>
                </Card>
              ))}
            </VStack>
          ))}
        </Grid>
      </VStack>
      <HStack gap={1.5} hAlign="center" vAlign="center" paddingBlockEnd={5}>
        <Icon icon={Check} size="xsm" color="secondary" />
        <Text type="supporting" size="xsm">
          Example thoughts · your space starts empty
        </Text>
      </HStack>
    </Card>
  );
}

export default function Marketing() {
  const returning = hasNotebook();
  const [onboarding, setOnboarding] = useState(false);
  useEffect(() => {
    if (!returning) void loadOnboarding();
  }, [returning]);
  const start = { returning, onStart: () => setOnboarding(true) };
  return (
    <AppShell
      height="auto"
      variant="wash"
      mobileNav={false}
      topNav={
        <TopNav
          label="Dump"
          heading={
            <Link href="/marketing" label="About Dump">
              <Brand />
            </Link>
          }
          centerContent={
            <Link href="#how-it-works" isStandalone className="max-phone:hidden">
              How it works
            </Link>
          }
          endContent={<Start {...start} variant="secondary" />}
        />
      }
    >
      <Layout
        height="auto"
        contentWidth={1280}
        content={
          <LayoutContent padding={6}>
            <VStack gap={10}>
              <VStack gap={6} hAlign="center" paddingBlockStart={10}>
                <HStack gap={2} vAlign="center">
                  <StatusDot variant="accent" label="Dump" />
                  <Text type="supporting" size="xsm" className="tracking-[0.15em]">
                    FOR THOUGHTS THAT NEED SOMEWHERE TO GO
                  </Text>
                </HStack>
                <Heading level={1} type="display-2" justify="center" textWrap="balance">
                  Your mind is for ideas.{' '}
                  <Text type="inherit" color="accent" display="block">
                    Not holding onto them.
                  </Text>
                </Heading>
                <Text type="large" color="secondary" justify="center" textWrap="balance">
                  The book someone mentioned. A half-formed idea. That link for later. Put it all in
                  Dump. It files each one into the right list for you.
                </Text>
                <Start {...start} size="lg" />
              </VStack>
              <Illustration />
              <Grid columns={{ minWidth: 240, max: 3 }} gap={10} id="how-it-works">
                {features.map(({ icon, title, body }) => (
                  <VStack gap={3} key={title}>
                    <Icon icon={icon} size="lg" color="accent" />
                    <Heading level={2}>{title}</Heading>
                    <Text color="secondary">{body}</Text>
                  </VStack>
                ))}
              </Grid>
              <Section variant="transparent" dividers={['top']} paddingBlock={10}>
                <VStack gap={5} hAlign="center">
                  <Icon icon={Asterisk} size="lg" color="accent" />
                  <Heading level={2} type="display-3" justify="center" textWrap="balance">
                    Less to carry. More room to think.
                  </Heading>
                  <Start {...start} />
                  <Text type="supporting" justify="center">
                    Bring your own server, or keep everything on this device.
                  </Text>
                </VStack>
              </Section>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider padding={6}>
            <HStack gap={5} hAlign="between" vAlign="center" wrap="wrap">
              <Brand size="compact" />
              <Text type="supporting">Out of your head. Into your space.</Text>
            </HStack>
          </LayoutFooter>
        }
      />
      {onboarding && (
        <Suspense>
          <Onboarding onClose={() => setOnboarding(false)} />
        </Suspense>
      )}
    </AppShell>
  );
}
