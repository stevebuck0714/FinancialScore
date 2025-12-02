/**
 * Machine Learning-based Account Mapping System
 * 
 * This module learns from user corrections and historical mappings to improve
 * automatic account mapping suggestions over time.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface LearnedMapping {
  qbAccount: string;
  qbAccountClassification: string;
  targetField: string;
  confidence: number; // 0-100
  reasoning: string;
  timesUsed: number;
  companiesUsed: number;
}

export interface MappingSuggestion {
  targetField: string;
  confidence: number;
  reasoning: string;
  source: 'keyword' | 'learned' | 'similar';
}

/**
 * Analyzes historical mappings across all companies to suggest mappings
 */
export class MappingLearner {
  /**
   * Get mapping suggestion for a QuickBooks account based on machine learning
   */
  async getSuggestion(
    accountName: string,
    accountClassification: string = ''
  ): Promise<MappingSuggestion | null> {
    // 1. Check for exact match in historical data
    const exactMatch = await this.getExactMatch(accountName);
    if (exactMatch) {
      return {
        targetField: exactMatch.targetField,
        confidence: exactMatch.confidence,
        reasoning: `Used by ${exactMatch.companiesUsed} companies, ${exactMatch.timesUsed} total times`,
        source: 'learned'
      };
    }

    // 2. Check for similar account names
    const similarMatch = await this.getSimilarMatch(accountName, accountClassification);
    if (similarMatch) {
      return {
        targetField: similarMatch.targetField,
        confidence: similarMatch.confidence,
        reasoning: `Similar to "${similarMatch.qbAccount}" (${similarMatch.confidence}% match)`,
        source: 'similar'
      };
    }

    return null;
  }

  /**
   * Find exact match in historical mappings
   */
  private async getExactMatch(accountName: string): Promise<LearnedMapping | null> {
    const mappings = await prisma.accountMapping.groupBy({
      by: ['qbAccount', 'targetField'],
      where: {
        qbAccount: {
          equals: accountName,
          mode: 'insensitive'
        }
      },
      _count: {
        id: true,
        companyId: true
      }
    });

    if (mappings.length === 0) return null;

    // Find the most common mapping
    const mostCommon = mappings.reduce((prev, current) => 
      current._count.id > prev._count.id ? current : prev
    );

    // Calculate confidence based on usage frequency
    const totalUsages = mappings.reduce((sum, m) => sum + m._count.id, 0);
    const confidence = Math.round((mostCommon._count.id / totalUsages) * 100);

    return {
      qbAccount: mostCommon.qbAccount,
      qbAccountClassification: '',
      targetField: mostCommon.targetField,
      confidence,
      reasoning: `Historical data`,
      timesUsed: mostCommon._count.id,
      companiesUsed: mostCommon._count.companyId
    };
  }

  /**
   * Find similar account names using fuzzy matching
   */
  private async getSimilarMatch(
    accountName: string,
    accountClassification: string
  ): Promise<LearnedMapping | null> {
    // Get all unique mappings
    const allMappings = await prisma.accountMapping.groupBy({
      by: ['qbAccount', 'qbAccountClassification', 'targetField'],
      _count: {
        id: true,
        companyId: true
      }
    });

    if (allMappings.length === 0) return null;

    // Calculate similarity scores
    const scoredMappings = allMappings.map(mapping => ({
      ...mapping,
      similarity: this.calculateSimilarity(
        accountName,
        accountClassification,
        mapping.qbAccount,
        mapping.qbAccountClassification || ''
      )
    }));

    // Filter for similarity >= 70%
    const similar = scoredMappings
      .filter(m => m.similarity >= 70)
      .sort((a, b) => b.similarity - a.similarity);

    if (similar.length === 0) return null;

    const best = similar[0];

    return {
      qbAccount: best.qbAccount,
      qbAccountClassification: best.qbAccountClassification || '',
      targetField: best.targetField,
      confidence: best.similarity,
      reasoning: `Similar accounts`,
      timesUsed: best._count.id,
      companiesUsed: best._count.companyId
    };
  }

  /**
   * Calculate similarity between two account names/classifications
   * Returns a score from 0-100
   */
  private calculateSimilarity(
    name1: string,
    class1: string,
    name2: string,
    class2: string
  ): number {
    const n1 = name1.toLowerCase().trim();
    const n2 = name2.toLowerCase().trim();
    const c1 = class1.toLowerCase().trim();
    const c2 = class2.toLowerCase().trim();

    // Exact match = 100%
    if (n1 === n2 && c1 === c2) return 100;

    let score = 0;

    // Name similarity (70% weight)
    score += this.stringSimilarity(n1, n2) * 0.7;

    // Classification similarity (30% weight)
    if (c1 && c2) {
      score += (c1 === c2 ? 100 : 0) * 0.3;
    } else {
      // If no classification, give half credit
      score += 50 * 0.3;
    }

    return Math.round(score);
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private stringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 100;

    const distance = this.levenshteinDistance(longer, shorter);
    return Math.round(((longer.length - distance) / longer.length) * 100);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Learn from a user's mapping decision
   * This is called when a user saves mappings
   */
  async learnFromMapping(
    companyId: string,
    qbAccount: string,
    qbAccountClassification: string,
    targetField: string
  ): Promise<void> {
    // The mapping is already saved in the database by the API
    // This method can be used for additional learning logic if needed
    console.log(`[ML] Learned: "${qbAccount}" -> ${targetField} for company ${companyId}`);
  }

  /**
   * Get statistics about learned mappings
   */
  async getStats(): Promise<{
    totalMappings: number;
    uniqueAccounts: number;
    topMappings: Array<{ account: string; targetField: string; count: number }>;
  }> {
    const totalMappings = await prisma.accountMapping.count();

    const uniqueAccountsResult = await prisma.accountMapping.groupBy({
      by: ['qbAccount']
    });

    const topMappingsResult = await prisma.accountMapping.groupBy({
      by: ['qbAccount', 'targetField'],
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 10
    });

    return {
      totalMappings,
      uniqueAccounts: uniqueAccountsResult.length,
      topMappings: topMappingsResult.map(m => ({
        account: m.qbAccount,
        targetField: m.targetField,
        count: m._count.id
      }))
    };
  }
}

// Export singleton instance
export const mappingLearner = new MappingLearner();

