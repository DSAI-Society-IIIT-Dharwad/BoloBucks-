import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { getConversations } from '../api/conversations';
import { InsightCard } from '../types/InsightCard';

interface HistoryScreenProps {
  refreshKey?: number;
  focusConversationId?: string | null;
}

export function HistoryScreen({ refreshKey = 0, focusConversationId = null }: HistoryScreenProps) {
  const [items, setItems] = useState<InsightCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

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
        setError(err?.message || 'Failed to load history');
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

  useEffect(() => {
    if (!focusConversationId) {
      return;
    }
    setSelectedId(focusConversationId);
  }, [focusConversationId]);

  useEffect(() => {
    if (selectedId) {
      return;
    }
    if (items.length > 0) {
      setSelectedId(items[0].conversation_id);
    }
  }, [items, selectedId]);

  const selected = useMemo(
    () => items.find((item) => item.conversation_id === selectedId) || null,
    [items, selectedId]
  );

  const intelligence = useMemo(() => {
    if (!selected) {
      return {
        suggestions: [] as string[],
        followUpQuestions: [] as string[],
        followUpAnswers: [] as string[],
      };
    }

    const topic = (selected.structured_summary.topic || '').toLowerCase();
    const transcript = (selected.raw_transcript || '').toLowerCase();
    const amountText =
      selected.structured_summary.amount_discussed || selected.financial_entities.amounts[0] || '';
    const isLoanConversation = topic.includes('loan') || transcript.includes('loan') || transcript.includes('emi');
    const isInvestmentConversation =
      topic.includes('invest') || transcript.includes('sip') || transcript.includes('mutual fund');

    const suggestions = new Set<string>();
    const followUpQuestions: string[] = [];
    const followUpAnswers: string[] = [];

    if (isLoanConversation) {
      suggestions.add('Compare interest rates and processing fees before final approval.');
      suggestions.add('Check whether the EMI stays within a comfortable monthly budget.');
      suggestions.add('Keep an emergency fund aside so the loan does not create cash-flow stress.');
    }

    if (isInvestmentConversation) {
      suggestions.add('Review the risk profile before increasing SIP or investment amounts.');
      suggestions.add('Start with a smaller commitment if the goal is still being refined.');
      suggestions.add('Track the plan for at least one cycle before changing allocation.');
    }

    if (amountText) {
      suggestions.add(`Validate the amount discussed: ${amountText}.`);
      followUpQuestions.unshift(`Is ${amountText} the final amount to proceed with?`);
      followUpAnswers.push(
        `Use ${amountText} as the working amount, then confirm it against the final plan before proceeding.`
      );
    }

    if (
      selected.sentiment.includes('neg') ||
      transcript.includes('worried') ||
      transcript.includes('stress')
    ) {
      suggestions.add('Address concerns first, then confirm the next action in writing.');
    }

    if (
      (selected.structured_summary.decision || '').toLowerCase().includes('none') ||
      selected.flagged_for_review
    ) {
      suggestions.add('Ask one follow-up question to remove ambiguity before closing the conversation.');
    }

    if (suggestions.size === 0) {
      suggestions.add('Summarize the main point and share a clear next step with the user.');
      suggestions.add('Confirm any amount, timeline, or decision that still needs validation.');
    }

    if (isLoanConversation) {
      followUpQuestions.push('What EMI range feels comfortable for this loan?');
      followUpQuestions.push('Are there any fees or terms that need a second look?');
      followUpQuestions.push('Should the loan amount be reduced to protect savings?');

      followUpAnswers.push('A safe EMI is one that still leaves enough room for savings and monthly expenses.');
      followUpAnswers.push('Compare rate, tenure, and processing fees together, not just the headline interest rate.');
      followUpAnswers.push('Reducing the loan amount can help if the repayment would feel tight later.');
    } else if (isInvestmentConversation) {
      followUpQuestions.push('What monthly SIP amount is realistic right now?');
      followUpQuestions.push('Is the current risk level aligned with the goal?');
      followUpQuestions.push('Should this plan start small and be reviewed later?');

      followUpAnswers.push('Start with a SIP amount that feels easy to sustain across multiple months.');
      followUpAnswers.push('If the goal is long-term, review risk first and avoid changing the plan too quickly.');
      followUpAnswers.push('Beginning smaller and revisiting later is often safer than overcommitting early.');
    } else {
      followUpQuestions.push('What is the main decision to confirm next?');
      followUpQuestions.push('Is there any amount or timeline that still needs validation?');
      followUpQuestions.push('What follow-up would remove the remaining uncertainty?');

      followUpAnswers.push('A clear next step is to restate the decision in one sentence and confirm it.');
      followUpAnswers.push('If timing or amount is unclear, ask one targeted follow-up before closing.');
      followUpAnswers.push('The best answer is usually the one that removes ambiguity for the next action.');
    }

    if (selected.flagged_for_review) {
      followUpQuestions.push('Which detail should be clarified before this is marked complete?');
      followUpAnswers.push('When the card is flagged, the safest move is to verify the uncertain point before finalizing.');
    }

    return {
      suggestions: Array.from(suggestions).slice(0, 5),
      followUpQuestions: Array.from(new Set(followUpQuestions)).slice(0, 4),
      followUpAnswers: Array.from(new Set(followUpAnswers)).slice(0, 4),
    };
  }, [selected]);

  const visualSummary = useMemo(() => {
    if (!selected) {
      return null;
    }

    const topic = selected.structured_summary.topic || 'conversation';
    const amountText = selected.structured_summary.amount_discussed || selected.financial_entities.amounts[0] || 'an amount';
    const decision = selected.structured_summary.decision || 'no final decision yet';
    const nextAction = selected.structured_summary.next_action || 'a next step still needs confirmation';
    const confidence = selected.confidence_score || 0;
    const flagged = selected.flagged_for_review;
    const isNegative = (selected.sentiment || '').toLowerCase().includes('neg');
    const needsReview = flagged && confidence >= 0.45;

    let status: 'good' | 'caution' | 'danger' = 'good';
    let statusLabel = 'Good financial decision';
    let statusReason = 'The latest conversation looks steady and easy to act on.';

    if (confidence < 0.45 || (isNegative && confidence < 0.65)) {
      status = 'danger';
      statusLabel = 'Dangerous, avoid';
      statusReason = 'The conversation has enough uncertainty that it should be reviewed before moving forward.';
    } else if (needsReview || confidence < 0.75 || isNegative) {
      status = 'caution';
      statusLabel = needsReview ? 'Needs review' : 'Risky, think twice';
      statusReason = needsReview
        ? 'The model is confident, but the conversation is flagged for review, so it should be checked before moving forward.'
        : 'There are some open points, so this should be reviewed carefully before a final call.';
    }

    const storySummary = `A conversation about ${topic} discussed ${amountText}. The current decision is ${decision}. The next step is ${nextAction}. Overall, this is ${statusLabel.toLowerCase()} because ${statusReason.toLowerCase()}`;

    const comparisonTitle = topic.toLowerCase().includes('loan') ? 'Before vs After' : 'Simple Outcome';
    const beforeLabel = topic.toLowerCase().includes('loan')
      ? 'Before: repayment feels uncertain'
      : 'Before: unclear next step';
    const afterLabel = topic.toLowerCase().includes('loan')
      ? 'After: EMI and fees are easier to manage'
      : 'After: the next action is clearer';

    return {
      status,
      statusLabel,
      statusReason,
      storySummary,
      comparisonTitle,
      beforeLabel,
      afterLabel,
    };
  }, [selected]);

  const conversationSummary = useMemo(() => {
    if (!selected) {
      return null;
    }

    const topic = selected.structured_summary.topic || 'financial discussion';
    const decision = selected.structured_summary.decision || 'no final decision yet';
    const nextAction = selected.structured_summary.next_action || 'a follow-up step still needs confirmation';
    const amountText =
      selected.structured_summary.amount_discussed || selected.financial_entities.amounts[0] || 'no clear amount mentioned';
    const confidencePercent = Math.round((selected.confidence_score || 0) * 100);
    const sentiment = selected.sentiment || 'neutral';

    const summaryText = `This conversation is mainly about ${topic}. The user discussed ${amountText}, with sentiment trending ${sentiment}. The current decision is ${decision}, and the next step is ${nextAction}.`;

    const keyPoints = [
      `Topic: ${topic}`,
      `Amount Discussed: ${amountText}`,
      `Decision: ${decision}`,
      `Next Action: ${nextAction}`,
      `Confidence: ${confidencePercent}%`,
    ];

    return {
      summaryText,
      keyPoints,
    };
  }, [selected]);

  const loanSuggestions = useMemo(() => {
    if (!selected) {
      return [] as Array<{
        bank: string;
        product: string;
        interestRange: string;
        processingFee: string;
        maxTenure: string;
        why: string;
      }>;
    }

    const topic = (selected.structured_summary.topic || '').toLowerCase();
    const transcript = (selected.raw_transcript || '').toLowerCase();
    const isLoanConversation =
      topic.includes('loan') || transcript.includes('loan') || transcript.includes('emi') || transcript.includes('home loan');

    if (!isLoanConversation) {
      return [];
    }

    const amountText =
      selected.structured_summary.amount_discussed || selected.financial_entities.amounts[0] || transcript;

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

    const options = [
      {
        bank: 'SBI',
        product: 'Home Loan MaxGain',
        interestRange: '8.40% - 9.15%',
        processingFee: 'Up to 0.35%',
        maxTenureYears: 30,
        maxAmountLakhs: 500,
      },
      {
        bank: 'HDFC Bank',
        product: 'Home Loan Standard',
        interestRange: '8.50% - 9.40%',
        processingFee: 'Up to 0.50%',
        maxTenureYears: 30,
        maxAmountLakhs: 600,
      },
      {
        bank: 'ICICI Bank',
        product: 'Express Home Loan',
        interestRange: '8.75% - 9.50%',
        processingFee: 'Up to 0.50%',
        maxTenureYears: 30,
        maxAmountLakhs: 500,
      },
      {
        bank: 'Axis Bank',
        product: 'Fast Forward Home Loan',
        interestRange: '8.75% - 9.60%',
        processingFee: 'Up to 1.00%',
        maxTenureYears: 30,
        maxAmountLakhs: 400,
      },
    ];

    const scored = options
      .map((option) => {
        const interestLow = Number(option.interestRange.split('%')[0]);
        const feePercent = option.processingFee.includes('1.00') ? 1.0 : option.processingFee.includes('0.50') ? 0.5 : 0.35;

        const amountFit = requestedLakhs ? (option.maxAmountLakhs >= requestedLakhs ? 1 : -2) : 0;
        const score = amountFit - interestLow * 0.3 - feePercent * 0.4 + option.maxTenureYears * 0.02;

        let why = `Competitive rate range and tenure up to ${option.maxTenureYears} years.`;
        if (requestedLakhs && option.maxAmountLakhs >= requestedLakhs) {
          why = `Can support around ${requestedLakhs.toFixed(1)} lakh requirement with manageable tenure options.`;
        } else if (requestedLakhs && option.maxAmountLakhs < requestedLakhs) {
          why = `May need re-check for higher amount requests above ${option.maxAmountLakhs} lakh.`;
        }

        return {
          bank: option.bank,
          product: option.product,
          interestRange: option.interestRange,
          processingFee: option.processingFee,
          maxTenure: `${option.maxTenureYears} years`,
          score,
          why,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ score, ...rest }) => rest);

    return scored;
  }, [selected]);

  const personalizedReminders = useMemo(() => {
    if (!selected) {
      return [] as Array<{
        title: string;
        detail: string;
        dueLabel: string;
        priority: 'High' | 'Medium' | 'Low';
      }>;
    }

    const topic = (selected.structured_summary.topic || '').toLowerCase();
    const transcript = (selected.raw_transcript || '').toLowerCase();
    const decision = selected.structured_summary.decision || 'No decision yet';
    const nextAction = selected.structured_summary.next_action || 'Confirm the next action';
    const amountText =
      selected.structured_summary.amount_discussed || selected.financial_entities.amounts[0] || 'the discussed amount';
    const isLoanConversation =
      topic.includes('loan') || transcript.includes('loan') || transcript.includes('emi') || transcript.includes('home loan');
    const isInvestmentConversation =
      topic.includes('invest') || transcript.includes('sip') || transcript.includes('mutual fund');

    const formatDueDate = (daysFromNow: number) => {
      const target = new Date();
      target.setDate(target.getDate() + daysFromNow);
      return target.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    };

    const reminders: Array<{
      title: string;
      detail: string;
      dueLabel: string;
      priority: 'High' | 'Medium' | 'Low';
    }> = [];

    reminders.push({
      title: 'Follow up on next action',
      detail: nextAction,
      dueLabel: `Due by ${formatDueDate(1)}`,
      priority: selected.flagged_for_review ? 'High' : 'Medium',
    });

    reminders.push({
      title: 'Decision confirmation',
      detail: `Reconfirm the decision: ${decision}`,
      dueLabel: `Due by ${formatDueDate(2)}`,
      priority: 'Medium',
    });

    reminders.push({
      title: 'Amount verification',
      detail: `Verify supporting documents for ${amountText}.`,
      dueLabel: `Due by ${formatDueDate(2)}`,
      priority: 'Medium',
    });

    if (isLoanConversation) {
      reminders.push({
        title: 'Collect lender comparisons',
        detail: 'Compare rates, processing fees, and tenure from at least 3 banks.',
        dueLabel: `Due by ${formatDueDate(3)}`,
        priority: 'High',
      });
      reminders.push({
        title: 'EMI affordability check',
        detail: 'Validate that EMI remains comfortable with monthly expenses and savings.',
        dueLabel: `Due by ${formatDueDate(4)}`,
        priority: 'High',
      });
    }

    if (isInvestmentConversation) {
      reminders.push({
        title: 'Risk profile review',
        detail: 'Re-check risk level before increasing monthly investment amount.',
        dueLabel: `Due by ${formatDueDate(3)}`,
        priority: 'Medium',
      });
      reminders.push({
        title: 'Portfolio progress check',
        detail: 'Review plan performance after one cycle before changing allocation.',
        dueLabel: `Due by ${formatDueDate(30)}`,
        priority: 'Low',
      });
    }

    return reminders.slice(0, 5);
  }, [selected]);

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const buildPdfHtml = (item: InsightCard) => {
    const topic = item.structured_summary.topic || 'unknown';
    const decision = item.structured_summary.decision || 'None';
    const nextAction = item.structured_summary.next_action || 'None';
    const confidence = Math.round((item.confidence_score || 0) * 100);
    const confidenceExplanation = item.structured_summary.confidence_explanation || 'No confidence explanation available.';
    const transcript = item.raw_transcript || 'No transcript available.';
    const amount = item.structured_summary.amount_discussed || item.financial_entities.amounts[0] || 'None';
    const flagged = item.flagged_for_review ? 'Yes' : 'No';
    const summaryStatus = visualSummary?.statusLabel || 'Good financial decision';
    const summaryReason = visualSummary?.statusReason || 'The latest conversation looks steady and easy to act on.';
    const storySummary = visualSummary?.storySummary || 'No story summary available.';
    const comparisonTitle = visualSummary?.comparisonTitle || 'Simple Outcome';
    const beforeLabel = visualSummary?.beforeLabel || 'Before: unclear next step';
    const afterLabel = visualSummary?.afterLabel || 'After: the next action is clearer';
    const summaryText = conversationSummary?.summaryText || 'No summary available.';

    const summaryPointsHtml = (conversationSummary?.keyPoints || [])
      .map((point) => `<li>${escapeHtml(point)}</li>`)
      .join('');

    const loanSuggestionsHtml = loanSuggestions
      .map(
        (item) => `
        <li>
          <strong>${escapeHtml(item.bank)}</strong> (${escapeHtml(item.product)}) - Rate: ${escapeHtml(item.interestRange)}, Fee: ${escapeHtml(item.processingFee)}, Tenure: ${escapeHtml(item.maxTenure)}. ${escapeHtml(item.why)}
        </li>`
      )
      .join('');

    const remindersHtml = personalizedReminders
      .map(
        (reminder) => `
        <li>
          <strong>${escapeHtml(reminder.title)}</strong> (${escapeHtml(reminder.priority)}): ${escapeHtml(reminder.detail)} - ${escapeHtml(reminder.dueLabel)}
        </li>`
      )
      .join('');

    const suggestionsHtml = suggestions
      .map((suggestion) => `<li>${escapeHtml(suggestion)}</li>`)
      .join('');

    const questionsHtml = followUpQuestions
      .map((question, index) => {
        const answer = followUpAnswers[index] || 'A quick clarification here will make the next step easier.';
        return `
          <div class="qa-item">
            <div class="qa-question"><span class="badge question">Q</span><span>${escapeHtml(question)}</span></div>
            <div class="qa-answer"><span class="badge answer">A</span><span>${escapeHtml(answer)}</span></div>
          </div>
        `;
      })
      .join('');

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Armour.AI Conversation Summary</title>
          <style>
            body {
              font-family: Arial, Helvetica, sans-serif;
              margin: 0;
              padding: 28px;
              color: #0f172a;
              background: #f8fafc;
            }
            .card {
              background: #ffffff;
              border: 1px solid #dbe4ee;
              border-radius: 16px;
              padding: 24px;
            }
            h1 {
              margin: 0 0 8px;
              font-size: 24px;
            }
            .meta {
              color: #475569;
              margin-bottom: 18px;
              font-size: 12px;
            }
            .section {
              margin-top: 18px;
            }
            .section h2 {
              margin: 0 0 8px;
              font-size: 16px;
              color: #16a34a;
            }
            .row {
              margin-bottom: 6px;
              line-height: 1.45;
            }
            .label {
              font-weight: 700;
            }
            ul {
              margin: 0;
              padding-left: 20px;
            }
            li {
              margin-bottom: 6px;
              line-height: 1.45;
            }
            .qa-item {
              border: 1px solid #dbe4ee;
              border-radius: 12px;
              padding: 12px;
              margin-bottom: 10px;
              background: #f8fafc;
            }
            .qa-question, .qa-answer {
              display: flex;
              gap: 10px;
              align-items: flex-start;
              line-height: 1.45;
            }
            .qa-answer {
              margin-top: 10px;
              padding-top: 10px;
              border-top: 1px solid #dbe4ee;
            }
            .badge {
              min-width: 24px;
              height: 24px;
              border-radius: 999px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
              font-weight: 700;
              flex-shrink: 0;
            }
            .question {
              background: #e0f2fe;
              color: #0369a1;
            }
            .answer {
              background: #dcfce7;
              color: #15803d;
            }
            .transcript {
              white-space: pre-wrap;
              line-height: 1.5;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Armour.AI Conversation Summary</h1>
            <div class="meta">Generated from the selected conversation in History.</div>

            <div class="section">
              <h2>Overview</h2>
              <div class="row"><span class="label">Topic:</span> ${escapeHtml(topic)}</div>
              <div class="row"><span class="label">Sentiment:</span> ${escapeHtml(item.sentiment || 'unknown')}</div>
              <div class="row"><span class="label">Confidence:</span> ${confidence}%</div>
              <div class="row"><span class="label">Flagged for review:</span> ${flagged}</div>
              <div class="row"><span class="label">Amount discussed:</span> ${escapeHtml(amount)}</div>
              <div class="row"><span class="label">Decision:</span> ${escapeHtml(decision)}</div>
              <div class="row"><span class="label">Next action:</span> ${escapeHtml(nextAction)}</div>
            </div>

            <div class="section">
              <h2>Confidence Explanation</h2>
              <div class="row">${escapeHtml(confidenceExplanation)}</div>
            </div>

            <div class="section">
              <h2>Visual Simplification</h2>
              <div class="row"><span class="label">Traffic Light:</span> ${escapeHtml(summaryStatus)}</div>
              <div class="row">${escapeHtml(summaryReason)}</div>
              <div class="row"><span class="label">Story:</span> ${escapeHtml(storySummary)}</div>
              <div class="row"><span class="label">${escapeHtml(comparisonTitle)}:</span> ${escapeHtml(beforeLabel)} -> ${escapeHtml(afterLabel)}</div>
            </div>

            <div class="section">
              <h2>Conversation Summary</h2>
              <div class="row">${escapeHtml(summaryText)}</div>
              <ul>${summaryPointsHtml || '<li>No key points available.</li>'}</ul>
            </div>

            <div class="section">
              <h2>Options Explored (Indicative)</h2>
              <ul>${loanSuggestionsHtml || '<li>Loan recommendations appear when the conversation is about loans.</li>'}</ul>
            </div>

            <div class="section">
              <h2>Personalized Reminders</h2>
              <ul>${remindersHtml || '<li>No reminders available.</li>'}</ul>
            </div>

            <div class="section">
              <h2>Ideas & Suggestions</h2>
              <ul>${suggestionsHtml || '<li>No suggestions available.</li>'}</ul>
            </div>

            <div class="section">
              <h2>Follow-up Questions</h2>
              ${questionsHtml || '<div class="row">No follow-up questions available.</div>'}
            </div>

            <div class="section">
              <h2>Transcript</h2>
              <div class="transcript">${escapeHtml(transcript)}</div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const handleExportPdf = async () => {
    if (!selected || exporting) {
      return;
    }

    setExporting(true);
    try {
      const html = buildPdfHtml(selected);

      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        return;
      }

      const result = await Print.printToFileAsync({ html });
      if (!result.uri) {
        throw new Error('PDF export did not return a file path.');
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save conversation as PDF',
        });
      } else {
        Alert.alert('PDF created', 'The PDF was generated successfully, but sharing is not available on this device.');
      }
    } catch (err: any) {
      Alert.alert('Export failed', err?.message || 'Unable to export the conversation as PDF.');
    } finally {
      setExporting(false);
    }
  };

  const suggestions = useMemo(() => {
    if (!selected) {
      return [];
    }

    const topic = (selected.structured_summary.topic || '').toLowerCase();
    const transcript = (selected.raw_transcript || '').toLowerCase();
    const sentiment = (selected.sentiment || '').toLowerCase();
    const amountText =
      selected.structured_summary.amount_discussed || selected.financial_entities.amounts[0] || '';

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

    if ((selected.structured_summary.decision || '').toLowerCase().includes('none') || selected.flagged_for_review) {
      itemsList.add('Ask one follow-up question to remove ambiguity before closing the conversation.');
    }

    if (itemsList.size === 0) {
      itemsList.add('Summarize the main point and share a clear next step with the user.');
      itemsList.add('Confirm any amount, timeline, or decision that still needs validation.');
    }

    return Array.from(itemsList).slice(0, 5);
  }, [selected]);

  const followUpQuestions = useMemo(() => {
    if (!selected) {
      return [];
    }

    const topic = (selected.structured_summary.topic || '').toLowerCase();
    const transcript = (selected.raw_transcript || '').toLowerCase();
    const amountText =
      selected.structured_summary.amount_discussed || selected.financial_entities.amounts[0] || '';
    const isLoanConversation = topic.includes('loan') || transcript.includes('loan') || transcript.includes('emi');
    const isInvestmentConversation =
      topic.includes('invest') || transcript.includes('sip') || transcript.includes('mutual fund');

    const questions: string[] = [];

    if (amountText) {
      questions.push(`Is ${amountText} the final amount to proceed with?`);
    }

    if (isLoanConversation) {
      questions.push('What EMI range feels comfortable for this loan?');
      questions.push('Are there any fees or terms that need a second look?');
      questions.push('Should the loan amount be reduced to protect savings?');
    } else if (isInvestmentConversation) {
      questions.push('What monthly SIP amount is realistic right now?');
      questions.push('Is the current risk level aligned with the goal?');
      questions.push('Should this plan start small and be reviewed later?');
    } else {
      questions.push('What is the main decision to confirm next?');
      questions.push('Is there any amount or timeline that still needs validation?');
      questions.push('What follow-up would remove the remaining uncertainty?');
    }

    if (selected.flagged_for_review) {
      questions.push('Which detail should be clarified before this is marked complete?');
    }

    return Array.from(new Set(questions)).slice(0, 4);
  }, [selected]);

  const followUpAnswers = useMemo(() => {
    if (!selected) {
      return [];
    }

    const topic = (selected.structured_summary.topic || '').toLowerCase();
    const transcript = (selected.raw_transcript || '').toLowerCase();
    const amountText =
      selected.structured_summary.amount_discussed || selected.financial_entities.amounts[0] || '';
    const isLoanConversation = topic.includes('loan') || transcript.includes('loan') || transcript.includes('emi');
    const isInvestmentConversation =
      topic.includes('invest') || transcript.includes('sip') || transcript.includes('mutual fund');

    const answers: string[] = [];

    if (amountText) {
      answers.push(
        `Use ${amountText} as the working amount, then confirm it against the final plan before proceeding.`
      );
    }

    if (isLoanConversation) {
      answers.push('A safe EMI is one that still leaves enough room for savings and monthly expenses.');
      answers.push('Compare rate, tenure, and processing fees together, not just the headline interest rate.');
      answers.push('Reducing the loan amount can help if the repayment would feel tight later.');
    } else if (isInvestmentConversation) {
      answers.push('Start with a SIP amount that feels easy to sustain across multiple months.');
      answers.push('If the goal is long-term, review risk first and avoid changing the plan too quickly.');
      answers.push('Beginning smaller and revisiting later is often safer than overcommitting early.');
    } else {
      answers.push('A clear next step is to restate the decision in one sentence and confirm it.');
      answers.push('If timing or amount is unclear, ask one targeted follow-up before closing.');
      answers.push('The best answer is usually the one that removes ambiguity for the next action.');
    }

    if (selected.flagged_for_review) {
      answers.push('When the card is flagged, the safest move is to verify the uncertain point before finalizing.');
    }

    return Array.from(new Set(answers)).slice(0, 4);
  }, [selected]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        <Text style={styles.subtitle}>Browse processed conversations and review extracted insights.</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color="#22c55e" />
          <Text style={styles.hint}>Loading conversations...</Text>
        </View>
      ) : null}

      {!loading && error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}

      {!loading && !error ? (
        <View style={styles.body}>
          <ScrollView style={styles.listPanel} contentContainerStyle={styles.listPanelContent}>
            {items.length === 0 ? <Text style={styles.hint}>No conversations yet.</Text> : null}
            {items.map((item) => {
              const active = item.conversation_id === selectedId;
              return (
                <Pressable
                  key={item.conversation_id}
                  style={[styles.item, active ? styles.itemActive : null]}
                  onPress={() => setSelectedId(item.conversation_id)}
                >
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.structured_summary.topic || 'unknown'}
                  </Text>
                  <Text style={styles.itemSubtitle} numberOfLines={1}>
                    {item.raw_transcript || 'No transcript'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.detailPanel}>
            {!selected ? (
              <Text style={styles.hint}>Select a conversation to view details.</Text>
            ) : (
              <ScrollView>
                <View style={styles.detailHeaderRow}>
                  <Text style={styles.detailHeading}>{selected.structured_summary.topic || 'unknown'}</Text>
                  <Pressable
                    style={[styles.exportButton, exporting ? styles.exportButtonDisabled : null]}
                    onPress={handleExportPdf}
                    disabled={exporting}
                  >
                    <Text style={styles.exportButtonText}>{exporting ? 'Preparing PDF...' : 'Download PDF'}</Text>
                  </Pressable>
                </View>
                <Text style={styles.detailMeta}>Sentiment: {selected.sentiment}</Text>
                <Text style={styles.detailMeta}>
                  Confidence: {Math.round((selected.confidence_score || 0) * 100)}%
                </Text>
                <Text style={styles.sectionTitle}>Decision</Text>
                <Text style={styles.sectionBody}>{selected.structured_summary.decision || 'None'}</Text>
                <Text style={styles.sectionTitle}>Next Action</Text>
                <Text style={styles.sectionBody}>{selected.structured_summary.next_action || 'None'}</Text>
                <Text style={styles.sectionTitle}>Transcript</Text>
                <Text style={styles.sectionBody}>{selected.raw_transcript || 'No transcript'}</Text>

                {selected.structured_summary.confidence_explanation ? (
                  <>
                    <Text style={styles.sectionTitle}>Confidence Explanation</Text>
                    <Text style={styles.sectionBody}>
                      {selected.structured_summary.confidence_explanation}
                    </Text>
                  </>
                ) : null}

                {visualSummary ? (
                  <>
                    <Text style={styles.sectionTitle}>Visual Simplification</Text>
                    <View style={styles.trafficCard}>
                      <View
                        style={[
                          styles.trafficDot,
                          visualSummary.status === 'good'
                            ? styles.trafficGood
                            : visualSummary.status === 'caution'
                            ? styles.trafficCaution
                            : styles.trafficDanger,
                        ]}
                      />
                      <View style={styles.trafficContent}>
                        <Text style={styles.trafficTitle}>{visualSummary.statusLabel}</Text>
                        <Text style={styles.sectionBody}>{visualSummary.statusReason}</Text>
                      </View>
                    </View>

                    <View style={styles.storyCard}>
                      <Text style={styles.storyLabel}>Story Mode</Text>
                      <Text style={styles.storyText}>{visualSummary.storySummary}</Text>
                    </View>

                    <View style={styles.compareCard}>
                      <Text style={styles.storyLabel}>{visualSummary.comparisonTitle}</Text>
                      <Text style={styles.compareBefore}>{visualSummary.beforeLabel}</Text>
                      <Text style={styles.compareArrow}>↓</Text>
                      <Text style={styles.compareAfter}>{visualSummary.afterLabel}</Text>
                    </View>
                  </>
                ) : null}

                <Text style={styles.sectionTitle}>Personalized Reminders</Text>
                <View style={styles.reminderWrap}>
                  {personalizedReminders.map((reminder, index) => (
                    <View key={`${reminder.title}-${index}`} style={styles.reminderCard}>
                      <View style={styles.reminderHeaderRow}>
                        <Text style={styles.reminderTitle}>{reminder.title}</Text>
                        <Text
                          style={[
                            styles.priorityBadge,
                            reminder.priority === 'High'
                              ? styles.priorityHigh
                              : reminder.priority === 'Medium'
                              ? styles.priorityMedium
                              : styles.priorityLow,
                          ]}
                        >
                          {reminder.priority}
                        </Text>
                      </View>
                      <Text style={styles.reminderDetail}>{reminder.detail}</Text>
                      <Text style={styles.reminderMeta}>{reminder.dueLabel}</Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.sectionTitle}>Follow-up Questions</Text>
                <View style={styles.qaWrap}>
                  {intelligence.followUpQuestions.map((question, index) => {
                    const answer = intelligence.followUpAnswers[index] || 'A quick clarification here will make the next step easier.';
                    return (
                      <View key={`${question}-${index}`} style={styles.qaCard}>
                        <View style={styles.qaQuestionRow}>
                          <Text style={styles.questionDot}>?</Text>
                          <Text style={styles.questionText}>{question}</Text>
                        </View>
                        <View style={styles.qaAnswerRow}>
                          <Text style={styles.answerLabel}>A</Text>
                          <Text style={styles.answerText}>{answer}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>

              </ScrollView>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050816',
    padding: 12,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 13,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  hint: {
    color: '#9ca3af',
    marginTop: 8,
  },
  error: {
    color: '#f87171',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  listPanel: {
    flex: 1,
    marginRight: 12,
  },
  listPanelContent: {
    paddingBottom: 20,
  },
  item: {
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
  },
  itemActive: {
    borderColor: '#22c55e',
    backgroundColor: '#111827',
  },
  itemTitle: {
    color: '#f8fafc',
    fontWeight: '600',
    marginBottom: 4,
  },
  itemSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
  },
  detailPanel: {
    flex: 2,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
  },
  detailHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailMeta: {
    color: '#a5b4fc',
    marginBottom: 4,
  },
  exportButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  exportButtonDisabled: {
    opacity: 0.7,
  },
  exportButtonText: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 12,
  },
  sectionTitle: {
    color: '#22c55e',
    marginTop: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  sectionBody: {
    color: '#e2e8f0',
    lineHeight: 21,
  },
  trafficCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#111827',
    marginTop: 6,
  },
  trafficDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    marginTop: 4,
  },
  trafficGood: {
    backgroundColor: '#22c55e',
  },
  trafficCaution: {
    backgroundColor: '#f59e0b',
  },
  trafficDanger: {
    backgroundColor: '#ef4444',
  },
  trafficContent: {
    flex: 1,
  },
  trafficTitle: {
    color: '#f8fafc',
    fontWeight: '700',
    marginBottom: 4,
  },
  storyCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#0b1220',
  },
  storyLabel: {
    color: '#38bdf8',
    fontWeight: '700',
    marginBottom: 4,
  },
  storyText: {
    color: '#e2e8f0',
    lineHeight: 20,
  },
  compareCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#111827',
  },
  compareBefore: {
    color: '#fca5a5',
    lineHeight: 20,
  },
  compareArrow: {
    color: '#94a3b8',
    marginVertical: 4,
  },
  compareAfter: {
    color: '#86efac',
    lineHeight: 20,
  },
  summaryCard: {
    marginTop: 6,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#111827',
  },
  summaryText: {
    color: '#e2e8f0',
    lineHeight: 20,
    marginBottom: 8,
  },
  summaryPoint: {
    color: '#cbd5e1',
    lineHeight: 20,
    marginBottom: 2,
  },
  bankSuggestionWrap: {
    marginTop: 6,
    gap: 8,
    marginBottom: 4,
  },
  bankCard: {
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
  },
  bankTitle: {
    color: '#38bdf8',
    fontWeight: '700',
    marginBottom: 4,
  },
  bankMeta: {
    color: '#e2e8f0',
    marginBottom: 2,
  },
  bankWhy: {
    color: '#cbd5e1',
    lineHeight: 20,
    marginTop: 4,
  },
  disclaimerText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  reminderWrap: {
    marginTop: 6,
    gap: 8,
    marginBottom: 4,
  },
  reminderCard: {
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
  },
  reminderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  reminderTitle: {
    color: '#f8fafc',
    fontWeight: '700',
    flex: 1,
  },
  reminderDetail: {
    color: '#e2e8f0',
    lineHeight: 20,
    marginBottom: 6,
  },
  reminderMeta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  priorityBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  priorityHigh: {
    color: '#fecaca',
    backgroundColor: '#7f1d1d',
  },
  priorityMedium: {
    color: '#fde68a',
    backgroundColor: '#78350f',
  },
  priorityLow: {
    color: '#bbf7d0',
    backgroundColor: '#14532d',
  },
  suggestionWrap: {
    marginTop: 6,
    gap: 8,
    marginBottom: 4,
  },
  suggestionCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243041',
    backgroundColor: '#111827',
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
  qaWrap: {
    marginTop: 6,
    gap: 8,
    marginBottom: 4,
  },
  qaCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#314155',
    backgroundColor: '#0b1220',
  },
  qaQuestionRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  questionDot: {
    color: '#38bdf8',
    fontWeight: '900',
    minWidth: 28,
    textAlign: 'center',
  },
  questionText: {
    color: '#e2e8f0',
    flex: 1,
    lineHeight: 20,
  },
  qaAnswerRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  answerLabel: {
    color: '#22c55e',
    fontWeight: '900',
    minWidth: 28,
    textAlign: 'center',
  },
  answerText: {
    color: '#cbd5e1',
    flex: 1,
    lineHeight: 20,
  },
});
