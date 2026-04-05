import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

import { getConversations } from '../api/conversations';
import { InsightCard } from '../types/InsightCard';

interface SummarySuggestionsScreenProps {
  refreshKey?: number;
}

function isMeaningfulAmount(value: string | null | undefined): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return Boolean(normalized) && normalized !== 'unknown' && normalized !== 'mentioned' && normalized !== 'none';
}

function formatWithIndianUnits(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  const fmt = (num: number) => (Number.isInteger(num) ? String(num) : num.toFixed(1).replace(/\.0$/, ''));

  if (value >= 10000000) {
    return `${fmt(value / 10000000)} crore`;
  }
  if (value >= 100000) {
    return `${fmt(value / 100000)} lakh`;
  }
  if (value >= 1000) {
    return `${fmt(value / 1000)} thousand`;
  }
  if (value >= 100) {
    return `${fmt(value)} hundred`;
  }
  return fmt(value);
}

function detectLikelyUnit(text: string): '' | 'lakh' | 'crore' | 'thousand' {
  const source = String(text || '').toLowerCase();

  if (/crore|crores|करोड़|à¤à¤°à¥à¤¡/.test(source)) {
    return 'crore';
  }
  if (/lakh|lakhs|lac|लाख|à¤²à¤¾/.test(source)) {
    return 'lakh';
  }
  if (/thousand|हजार|à¤¹à¤à¤¾/.test(source)) {
    return 'thousand';
  }
  return '';
}

function isLoanLikeContext(text: string): boolean {
  const source = String(text || '').toLowerCase();
  return /\bloan\b|\bemi\b|home\s*loan|लोन|कर्ज|ऋण|à¤²à¥à¤¨/.test(source);
}

function normalizeAmountText(rawAmount: string, transcript: string): string {
  const amount = String(rawAmount || '').trim().toLowerCase();
  if (!amount) {
    return '';
  }

  const explicit = amount.match(/(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|crore|crores|thousand|hundred|rupees?|rs\.?|inr)/i);
  if (explicit) {
    const numeric = Number(explicit[1]);
    const unitRaw = explicit[2].toLowerCase();
    if (unitRaw.startsWith('crore')) return `${explicit[1]} crore`;
    if (unitRaw.startsWith('lakh') || unitRaw === 'lac') return `${explicit[1]} lakh`;
    if (unitRaw.startsWith('thousand')) return `${explicit[1]} thousand`;
    if (unitRaw.startsWith('hundred')) return `${explicit[1]} hundred`;
    if (unitRaw.startsWith('rupee') || unitRaw === 'rs' || unitRaw === 'rs.' || unitRaw === 'inr') {
      const unitized = formatWithIndianUnits(numeric);
      return unitized || `${explicit[1]} rupees`;
    }
  }

  const numericOnly = amount.match(/^(\d+(?:\.\d+)?)$/);
  if (numericOnly) {
    const value = Number(numericOnly[1]);
    const likelyUnit = detectLikelyUnit(transcript);
    if (likelyUnit) {
      return `${numericOnly[1]} ${likelyUnit}`;
    }
    return formatWithIndianUnits(value) || numericOnly[1];
  }

  return amount;
}

function inferAmountFromText(text: string): string {
  const source = String(text || '').toLowerCase();
  const likelyUnit = detectLikelyUnit(source);

  const explicitAmount = source.match(/(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|crore|crores|thousand|rupees?|rs\.?|inr)/i);
  if (explicitAmount) {
    return normalizeAmountText(`${explicitAmount[1]} ${explicitAmount[2]}`, source);
  }

  const numberOnly = source.match(/\b(\d+(?:\.\d+)?)\b/);
  if (numberOnly) {
    if (likelyUnit) {
      return `${numberOnly[1]} ${likelyUnit}`;
    }

    // If unit token is missing but context is loan-like, default to lakh for realistic Indian usage.
    if (isLoanLikeContext(source)) {
      return `${numberOnly[1]} lakh`;
    }

    return normalizeAmountText(numberOnly[1], source);
  }

  return '';
}

function resolveAmountText(card: InsightCard | null): string {
  if (!card) {
    return '';
  }

  const summaryAmount = card.structured_summary.amount_discussed;
  if (isMeaningfulAmount(summaryAmount)) {
    return normalizeAmountText(String(summaryAmount).trim(), card.raw_transcript || '');
  }

  const entityAmount = card.financial_entities.amounts?.[0];
  if (isMeaningfulAmount(entityAmount)) {
    return normalizeAmountText(String(entityAmount).trim(), card.raw_transcript || '');
  }

  const inferred = inferAmountFromText(card.raw_transcript || '');
  if (inferred) {
    return inferred;
  }

  return 'no clear amount mentioned';
}

function parseAmountToRupees(value: string | null | undefined): number | null {
  const text = String(value || '').toLowerCase();
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const base = Number(match[1]);
  if (!Number.isFinite(base) || base <= 0) {
    return null;
  }

  if (text.includes('crore')) return base * 10000000;
  if (text.includes('lakh') || text.includes('lac')) return base * 100000;
  if (text.includes('thousand')) return base * 1000;
  if (text.includes('hundred')) return base * 100;
  return base;
}

export function SummarySuggestionsScreen({ refreshKey = 0 }: SummarySuggestionsScreenProps) {
  const [items, setItems] = useState<InsightCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await getConversations(1, 100);
        if (!active) {
          return;
        }
        setItems(response.data || []);
      } catch (err: any) {
        if (!active) {
          return;
        }
        setError(err?.message || 'Failed to load summary and suggestions');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const latestConversation = useMemo(() => {
    if (items.length === 0) {
      return null;
    }

    return [...items].sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return bTime - aTime;
    })[0];
  }, [items]);

  const summary = useMemo(() => {
    if (!latestConversation) {
      return null;
    }

    const topic = latestConversation.structured_summary.topic || 'financial discussion';
    const decision = latestConversation.structured_summary.decision || 'no final decision yet';
    const nextAction = latestConversation.structured_summary.next_action || 'a follow-up step still needs confirmation';
    const amountText = resolveAmountText(latestConversation);
    const confidencePercent = Math.round((latestConversation.confidence_score || 0) * 100);
    const sentiment = latestConversation.sentiment || 'neutral';

    return {
      summaryText: `This conversation is mainly about ${topic}. The user discussed ${amountText}, with sentiment trending ${sentiment}. The current decision is ${decision}, and the next step is ${nextAction}.`,
      points: [
        `Topic: ${topic}`,
        `Amount Discussed: ${amountText}`,
        `Decision: ${decision}`,
        `Next Action: ${nextAction}`,
        `Confidence: ${confidencePercent}%`,
      ],
    };
  }, [latestConversation]);

  const suggestions = useMemo(() => {
    if (!latestConversation) {
      return [] as string[];
    }

    const topic = (latestConversation.structured_summary.topic || '').toLowerCase();
    const transcript = (latestConversation.raw_transcript || '').toLowerCase();
    const sentiment = (latestConversation.sentiment || '').toLowerCase();
    const amountTextResolved = resolveAmountText(latestConversation);
    const amountText = isMeaningfulAmount(amountTextResolved) ? amountTextResolved : '';

    const itemsList = new Set<string>();

    if (topic.includes('loan') || transcript.includes('loan') || transcript.includes('emi')) {
      itemsList.add('Compare interest rates and processing fees before final approval.');
      itemsList.add('Check whether the EMI stays within a comfortable monthly budget.');
      itemsList.add('Keep an emergency fund aside so the loan does not create cash-flow stress.');
    }

    if (topic.includes('invest') || transcript.includes('sip') || transcript.includes('mutual fund')) {
      itemsList.add('Review the risk profile before increasing SIP or investment amounts.');
      itemsList.add('Start with a smaller commitment if the goal is still being refined.');
      itemsList.add('Track the plan for at least one cycle before changing allocation.');
    }

    if (amountText) {
      itemsList.add(`Validate the amount discussed: ${amountText}.`);
    }

    if (sentiment.includes('neg') || transcript.includes('worried') || transcript.includes('stress')) {
      itemsList.add('Address concerns first, then confirm the next action in writing.');
    }

    if (
      (latestConversation.structured_summary.decision || '').toLowerCase().includes('none') ||
      latestConversation.flagged_for_review
    ) {
      itemsList.add('Ask one follow-up question to remove ambiguity before closing the conversation.');
    }

    if (itemsList.size === 0) {
      itemsList.add('Summarize the main point and share a clear next step with the user.');
      itemsList.add('Confirm any amount, timeline, or decision that still needs validation.');
    }

    return Array.from(itemsList).slice(0, 6);
  }, [latestConversation]);

  const optionsExplored = useMemo(() => {
    if (!latestConversation) {
      return [] as Array<{
        provider: string;
        plan: string;
        detail1: string;
        detail2: string;
        detail3: string;
        why: string;
      }>;
    }

    const topic = (latestConversation.structured_summary.topic || '').toLowerCase();
    const transcript = (latestConversation.raw_transcript || '').toLowerCase();
    const isLoanConversation =
      topic.includes('loan') || transcript.includes('loan') || transcript.includes('emi') || transcript.includes('home loan');
    const isInvestmentConversation =
      topic.includes('invest') || transcript.includes('sip') || transcript.includes('mutual fund') || transcript.includes('equity');
    const isSavingsConversation =
      topic.includes('saving') || transcript.includes('saving') || transcript.includes('fd') || transcript.includes('rd');

    const amountText =
      (() => {
        const resolved = resolveAmountText(latestConversation);
        return isMeaningfulAmount(resolved) ? resolved : transcript;
      })();

    const parseAmountInLakhs = (text: string) => {
      const raw = (text || '').toLowerCase();
      const numeric = raw.match(/(\d+(?:\.\d+)?)/);
      if (!numeric) {
        return null;
      }

      const base = Number(numeric[1]);
      if (Number.isNaN(base)) {
        return null;
      }

      if (raw.includes('crore')) {
        return base * 100;
      }
      if (raw.includes('lakh') || raw.includes('lac')) {
        return base;
      }
      if (base >= 100000) {
        return base / 100000;
      }

      return base;
    };

    const requestedLakhs = parseAmountInLakhs(amountText || '');

    if (isLoanConversation) {
      const options = [
        {
          provider: 'SBI',
          plan: 'Home Loan MaxGain',
          detail1: 'Rate: 8.40% - 9.15%',
          detail2: 'Processing Fee: Up to 0.35%',
          detail3: 'Max Tenure: 30 years',
          maxAmountLakhs: 500,
          rankingScore: 3,
        },
        {
          provider: 'HDFC Bank',
          plan: 'Home Loan Standard',
          detail1: 'Rate: 8.50% - 9.40%',
          detail2: 'Processing Fee: Up to 0.50%',
          detail3: 'Max Tenure: 30 years',
          maxAmountLakhs: 600,
          rankingScore: 2,
        },
        {
          provider: 'ICICI Bank',
          plan: 'Express Home Loan',
          detail1: 'Rate: 8.75% - 9.50%',
          detail2: 'Processing Fee: Up to 0.50%',
          detail3: 'Max Tenure: 30 years',
          maxAmountLakhs: 500,
          rankingScore: 1,
        },
      ];

      return options
        .map((option) => ({
          provider: option.provider,
          plan: option.plan,
          detail1: option.detail1,
          detail2: option.detail2,
          detail3: option.detail3,
          why:
            requestedLakhs && option.maxAmountLakhs >= requestedLakhs
              ? `Can support around ${requestedLakhs.toFixed(1)} lakh requirement with manageable tenure options.`
              : 'Suitable for comparison on tenure, rate range, and fee structure.',
          score: option.rankingScore + (requestedLakhs && option.maxAmountLakhs >= requestedLakhs ? 2 : 0),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ score, ...rest }) => rest);
    }

    if (isInvestmentConversation) {
      return [
        {
          provider: 'Index Strategy',
          plan: 'Large-Cap Index SIP',
          detail1: 'Risk Level: Moderate',
          detail2: 'Typical Horizon: 5+ years',
          detail3: 'Expense Profile: Low',
          why: 'Useful when consistency and lower cost are preferred over active stock picking.',
        },
        {
          provider: 'Balanced Strategy',
          plan: 'Balanced Advantage SIP',
          detail1: 'Risk Level: Moderate-Low',
          detail2: 'Typical Horizon: 3-5 years',
          detail3: 'Allocation: Equity + Debt mix',
          why: 'Can smooth volatility while still participating in market growth.',
        },
        {
          provider: 'Goal Strategy',
          plan: 'Flexi-Cap SIP',
          detail1: 'Risk Level: Moderate-High',
          detail2: 'Typical Horizon: 5+ years',
          detail3: 'Allocation: Dynamic market-cap mix',
          why: 'Appropriate for long-term goals where moderate volatility is acceptable.',
        },
      ];
    }

    if (isSavingsConversation) {
      return [
        {
          provider: 'Bank Deposit',
          plan: 'Fixed Deposit (FD)',
          detail1: 'Risk Level: Low',
          detail2: 'Return Type: Fixed',
          detail3: 'Liquidity: Low until maturity',
          why: 'Works well for capital protection and predictable returns over a fixed horizon.',
        },
        {
          provider: 'Bank Deposit',
          plan: 'Recurring Deposit (RD)',
          detail1: 'Risk Level: Low',
          detail2: 'Contribution: Monthly fixed',
          detail3: 'Use Case: Disciplined savings',
          why: 'Useful when you want automated monthly savings with fixed return expectations.',
        },
        {
          provider: 'Liquidity Strategy',
          plan: 'Emergency Fund + Liquid Fund mix',
          detail1: 'Risk Level: Low-Moderate',
          detail2: 'Liquidity: High',
          detail3: 'Use Case: Short-term buffer',
          why: 'Helps keep emergency funds accessible while avoiding idle cash.',
        },
      ];
    }

    return [
      {
        provider: 'Clarification Needed',
        plan: 'Refine conversation intent',
        detail1: 'Step 1: Confirm exact financial goal',
        detail2: 'Step 2: Confirm amount and timeline',
        detail3: 'Step 3: Confirm risk comfort level',
        why: 'Once intent is clearer, options can be narrowed down to relevant products.',
      },
    ];
  }, [latestConversation]);

  const visualStory = useMemo(() => {
    if (!latestConversation) {
      return null;
    }

    const topic = latestConversation.structured_summary.topic || 'discussion';
    const amount = resolveAmountText(latestConversation);
    const decision = latestConversation.structured_summary.decision || 'no final decision yet';
    const nextAction = latestConversation.structured_summary.next_action || 'follow-up pending';
    const confidence = Math.max(0, Math.min(100, Math.round((latestConversation.confidence_score || 0) * 100)));
    const sentiment = String(latestConversation.sentiment || 'neutral').toLowerCase();
    const flagged = Boolean(latestConversation.flagged_for_review);

    const isDecisionClear = !/none|pending|unknown|no final/i.test(decision);
    const isNextStepClear = !/pending|unknown|needs confirmation/i.test(nextAction);
    const clarity = Math.max(20, Math.min(100, (isDecisionClear ? 50 : 20) + (isNextStepClear ? 40 : 15)));
    const urgency = flagged ? 78 : 34;

    const sentimentTone = sentiment.includes('pos')
      ? { label: 'Positive', color: '#22c55e' }
      : sentiment.includes('neg')
      ? { label: 'Sensitive', color: '#ef4444' }
      : { label: 'Neutral', color: '#f59e0b' };

    return {
      sentimentTone,
      stages: [
        {
          icon: 'message-text-outline' as const,
          label: 'What user said',
          detail: `Topic: ${topic}`,
        },
        {
          icon: 'currency-inr' as const,
          label: 'Money context',
          detail: amount || 'Amount not clearly stated',
        },
        {
          icon: 'check-decagram-outline' as const,
          label: 'Decision status',
          detail: decision,
        },
        {
          icon: 'arrow-right-circle-outline' as const,
          label: 'Next step',
          detail: nextAction,
        },
      ],
      metrics: [
        { label: 'Confidence', value: confidence, color: '#22c55e' },
        { label: 'Clarity', value: clarity, color: '#38bdf8' },
        { label: 'Urgency', value: urgency, color: '#f59e0b' },
      ],
    };
  }, [latestConversation]);

  const chartInsights = useMemo(() => {
    if (!latestConversation) {
      return null;
    }

    // 2) Pie chart: distribution from multilingual keyword matches in latest conversation.
    const analysisText = [
      latestConversation.structured_summary.topic,
      latestConversation.raw_transcript,
      latestConversation.structured_summary.decision,
      latestConversation.structured_summary.next_action,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const countMatches = (pattern: RegExp) => {
      const matches = analysisText.match(pattern);
      return matches ? matches.length : 0;
    };

    const loanSignals = countMatches(/\bloan\b|\bemi\b|home\s*loan|personal\s*loan|लोन|ऋण|कर्ज/gi);
    const sipSignals = countMatches(/\bsip\b|\binvest\b|mutual\s*fund|equity|निवेश|म्यूचुअल|इक्विटी/gi);
    const expenseSignals = countMatches(/\bexpense\b|\bexpenses\b|\bspend\b|\bbill\b|\brent\b|खर्च|खर्चा|बिल/gi);
    const savingSignals = countMatches(/\bsave\b|\bsavings\b|\bfd\b|\brd\b|emergency\s*fund|बचत|सेविंग/gi);

    const totals = [loanSignals, sipSignals, expenseSignals, savingSignals];
    const signalTotal = totals.reduce((sum, val) => sum + val, 0);

    let pieDistribution = [
      { label: 'Loans', value: 0, color: '#22c55e' },
      { label: 'SIP', value: 0, color: '#38bdf8' },
      { label: 'Expenses', value: 0, color: '#f59e0b' },
      { label: 'Savings', value: 0, color: '#a78bfa' },
    ];

    if (signalTotal > 0) {
      pieDistribution = [
        { label: 'Loans', value: Math.round((loanSignals / signalTotal) * 100), color: '#22c55e' },
        { label: 'SIP', value: Math.round((sipSignals / signalTotal) * 100), color: '#38bdf8' },
        { label: 'Expenses', value: Math.round((expenseSignals / signalTotal) * 100), color: '#f59e0b' },
        { label: 'Savings', value: Math.round((savingSignals / signalTotal) * 100), color: '#a78bfa' },
      ];

      const normalizedTotal = pieDistribution.reduce((sum, item) => sum + item.value, 0);
      if (normalizedTotal !== 100) {
        const diff = 100 - normalizedTotal;
        pieDistribution[0].value = Math.max(0, pieDistribution[0].value + diff);
      }
    }

    const pieCircumference = 2 * Math.PI * 48;
    let runningOffset = 0;
    const pieWithOffsets = pieDistribution.map((item) => {
      const strokeLength = (item.value / 100) * pieCircumference;
      const currentOffset = runningOffset;
      runningOffset += strokeLength;
      return {
        ...item,
        strokeLength,
        strokeOffset: -currentOffset,
      };
    });

    // 3) Bar chart: provider comparison using extracted numeric rates only.
    const rateRows = optionsExplored
      .map((option) => {
        if (option.provider.toLowerCase().includes('clarification')) {
          return null;
        }

        const rateText = `${option.detail1} ${option.detail2} ${option.plan}`;
        // Accept only explicit rate/interest percentage values for true comparison.
        const percentageMatch = rateText.match(/(\d+(?:\.\d+)?)\s*%/i);
        const interestLike = /rate|interest/i.test(rateText);
        const parsedRate = percentageMatch ? Number(percentageMatch[1]) : null;

        if (!interestLike || !parsedRate || !Number.isFinite(parsedRate)) {
          return null;
        }

        return {
          label: option.provider,
          value: parsedRate,
        };
      })
      .filter((entry): entry is { label: string; value: number } => Boolean(entry))
      .slice(0, 3) as Array<{ label: string; value: number }>;

    const bars = rateRows;
    const maxBar = Math.max(...bars.map((b) => b.value), 1);
    const barData = bars.map((b, idx) => ({
      ...b,
      widthPercent: Math.max(18, Math.round((b.value / maxBar) * 100)),
      color: ['#22c55e', '#38bdf8', '#f59e0b'][idx % 3],
    }));

    const latestAmount = resolveAmountText(latestConversation);

    return {
      pieWithOffsets,
      barData,
      amountLabel: latestAmount,
      hasPieData: signalTotal > 0,
      hasBarData: barData.length >= 2,
    };
  }, [items, latestConversation, optionsExplored]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Summary and Suggestion</Text>
        <Text style={styles.subtitle}>Quick guidance generated from your latest conversation.</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#22c55e" />
          <Text style={styles.muted}>Loading latest conversation...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : !latestConversation ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>No conversations found yet.</Text>
        </View>
      ) : (
        <>
          <View style={styles.cardBlock}>
            <Text style={styles.blockTitle}>Conversation Summary</Text>
            <Text style={styles.blockBody}>{summary?.summaryText || 'No summary available.'}</Text>
            {(summary?.points || []).map((point, index) => (
              <Text key={`${point}-${index}`} style={styles.pointLine}>
                {'- '}
                {point}
              </Text>
            ))}
          </View>

          {visualStory ? (
            <View style={styles.cardBlock}>
              <Text style={styles.blockTitle}>Visual Conversation Story</Text>
              <Text style={styles.blockBody}>
                A simple picture-like view of what this conversation means and what should happen next.
              </Text>

              <View style={styles.storyFlowWrap}>
                {visualStory.stages.map((stage, index) => (
                  <View key={`${stage.label}-${index}`} style={styles.storyNode}>
                    <View style={styles.storyIconWrap}>
                      <MaterialCommunityIcons name={stage.icon} size={18} color="#22c55e" />
                    </View>
                    <View style={styles.storyTextWrap}>
                      <Text style={styles.storyLabel}>{stage.label}</Text>
                      <Text style={styles.storyDetail}>{stage.detail}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.sentimentRow}>
                <Text style={styles.sentimentTitle}>Conversation Tone</Text>
                <View style={[styles.sentimentPill, { borderColor: visualStory.sentimentTone.color }]}> 
                  <View style={[styles.sentimentDot, { backgroundColor: visualStory.sentimentTone.color }]} />
                  <Text style={[styles.sentimentText, { color: visualStory.sentimentTone.color }]}>
                    {visualStory.sentimentTone.label}
                  </Text>
                </View>
              </View>

              <View style={styles.metricWrap}>
                {visualStory.metrics.map((metric) => (
                  <View key={metric.label} style={styles.metricRow}>
                    <View style={styles.metricHeader}>
                      <Text style={styles.metricLabel}>{metric.label}</Text>
                      <Text style={styles.metricValue}>{metric.value}%</Text>
                    </View>
                    <View style={styles.metricTrack}>
                      <View style={[styles.metricFill, { width: `${metric.value}%`, backgroundColor: metric.color }]} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {chartInsights ? (
            <View style={styles.cardBlock}>
              <Text style={styles.blockTitle}>2. Pie Chart - Money Distribution</Text>
              <Text style={styles.blockBody}>
                Snapshot of where money is likely going after commitments.
              </Text>
              <View style={styles.pieWrap}>
                {chartInsights.hasPieData ? (
                  <>
                    <Svg width={150} height={150} viewBox="0 0 150 150">
                      <Circle cx={75} cy={75} r={48} stroke="#1f2937" strokeWidth={24} fill="none" />
                      {chartInsights.pieWithOffsets.map((segment) => (
                        <Circle
                          key={`pie-${segment.label}`}
                          cx={75}
                          cy={75}
                          r={48}
                          stroke={segment.color}
                          strokeWidth={24}
                          fill="none"
                          strokeDasharray={`${segment.strokeLength} ${2 * Math.PI * 48}`}
                          strokeDashoffset={segment.strokeOffset}
                          transform="rotate(-90 75 75)"
                        />
                      ))}
                    </Svg>
                    <View style={styles.legendWrap}>
                      {chartInsights.pieWithOffsets.map((segment) => (
                        <View key={`legend-${segment.label}`} style={styles.legendRow}>
                          <View style={[styles.legendDot, { backgroundColor: segment.color }]} />
                          <Text style={styles.legendText}>{`${segment.label} ${segment.value}%`}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <Text style={styles.graphNoDataText}>
                    Not enough keyword evidence in the latest conversation to calculate distribution.
                  </Text>
                )}
              </View>
            </View>
          ) : null}

          {chartInsights ? (
            <View style={styles.cardBlock}>
              <Text style={styles.blockTitle}>3. Bar Chart - Comparison View</Text>
              <Text style={styles.blockBody}>
                Side-by-side comparison to make option selection easier.
              </Text>
              <View style={styles.barWrap}>
                {chartInsights.hasBarData ? (
                  chartInsights.barData.map((bar) => (
                    <View key={`bar-${bar.label}`} style={styles.barRow}>
                      <Text style={styles.barLabel}>{bar.label}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${bar.widthPercent}%`, backgroundColor: bar.color }]} />
                      </View>
                      <Text style={styles.barValue}>{bar.value.toFixed(2)}%</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.graphNoDataText}>
                    At least two options with explicit rate percentages are needed for comparison.
                  </Text>
                )}
              </View>
            </View>
          ) : null}

          <View style={styles.cardBlock}>
            <Text style={styles.blockTitle}>Suggestion Engine</Text>
            <View style={styles.suggestionWrap}>
              {suggestions.map((item, index) => (
                <View key={`${item}-${index}`} style={styles.suggestionCard}>
                  <Text style={styles.suggestionIndex}>{String(index + 1).padStart(2, '0')}</Text>
                  <Text style={styles.suggestionText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.cardBlock}>
            <Text style={styles.blockTitle}>Options Explored</Text>
            <View style={styles.loanWrap}>
              {optionsExplored.map((item, index) => (
                <View key={`${item.provider}-${item.plan}-${index}`} style={styles.loanCard}>
                  <Text style={styles.loanTitle}>{item.provider}</Text>
                  <Text style={styles.loanMeta}>{item.plan}</Text>
                  <Text style={styles.loanMeta}>{item.detail1}</Text>
                  <Text style={styles.loanMeta}>{item.detail2}</Text>
                  <Text style={styles.loanMeta}>{item.detail3}</Text>
                  <Text style={styles.loanWhy}>{item.why}</Text>
                </View>
              ))}
              <Text style={styles.disclaimerText}>
                Indicative comparison only. Verify suitability, risk, eligibility, and latest terms before deciding.
              </Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1020',
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  headerBlock: {
    marginBottom: 6,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: '#94a3b8',
    marginTop: 6,
    fontSize: 13,
  },
  centered: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 10,
  },
  muted: {
    color: '#94a3b8',
  },
  error: {
    color: '#fca5a5',
    textAlign: 'center',
  },
  cardBlock: {
    borderWidth: 1,
    borderColor: '#243041',
    borderRadius: 14,
    backgroundColor: '#111827',
    padding: 14,
  },
  blockTitle: {
    color: '#22c55e',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  blockBody: {
    color: '#e2e8f0',
    lineHeight: 20,
    marginBottom: 8,
  },
  pointLine: {
    color: '#cbd5e1',
    lineHeight: 20,
    marginBottom: 2,
  },
  storyFlowWrap: {
    gap: 8,
  },
  storyNode: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: '#243041',
    borderRadius: 12,
    backgroundColor: '#0b1220',
    padding: 10,
  },
  storyIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10201a',
    borderWidth: 1,
    borderColor: '#1f3b2f',
  },
  storyTextWrap: {
    flex: 1,
  },
  storyLabel: {
    color: '#e2e8f0',
    fontWeight: '700',
    marginBottom: 2,
  },
  storyDetail: {
    color: '#cbd5e1',
    lineHeight: 18,
  },
  sentimentRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sentimentTitle: {
    color: '#e2e8f0',
    fontWeight: '700',
  },
  sentimentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#0b1220',
  },
  sentimentDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  sentimentText: {
    fontWeight: '700',
    fontSize: 12,
  },
  metricWrap: {
    marginTop: 10,
    gap: 10,
  },
  metricRow: {
    gap: 6,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    color: '#cbd5e1',
    fontWeight: '600',
  },
  metricValue: {
    color: '#e2e8f0',
    fontWeight: '700',
    fontSize: 12,
  },
  metricTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#1f2937',
  },
  metricFill: {
    height: '100%',
    borderRadius: 999,
  },
  graphNoDataText: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: 12,
  },
  pieWrap: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  legendWrap: {
    flex: 1,
    minWidth: 140,
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendText: {
    color: '#e2e8f0',
    fontSize: 13,
  },
  barWrap: {
    gap: 10,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    width: 72,
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#1f2937',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
  barValue: {
    width: 48,
    color: '#e2e8f0',
    fontSize: 12,
    textAlign: 'right',
    fontWeight: '700',
  },
  suggestionWrap: {
    gap: 8,
  },
  suggestionCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#0b1220',
  },
  suggestionIndex: {
    color: '#22c55e',
    fontWeight: '800',
    minWidth: 28,
  },
  suggestionText: {
    color: '#e2e8f0',
    flex: 1,
    lineHeight: 20,
  },
  loanWrap: {
    gap: 8,
  },
  loanCard: {
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#0b1220',
    borderRadius: 12,
    padding: 12,
  },
  loanTitle: {
    color: '#38bdf8',
    fontWeight: '700',
    marginBottom: 4,
  },
  loanMeta: {
    color: '#e2e8f0',
    marginBottom: 2,
  },
  loanWhy: {
    color: '#cbd5e1',
    lineHeight: 20,
    marginTop: 4,
  },
  disclaimerText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
});
