package com.exceptioncoder.toolbox.aisecretary.service;

import com.exceptioncoder.toolbox.aisecretary.domain.Note;
import com.exceptioncoder.toolbox.aisecretary.repository.NoteRepository;
import dev.langchain4j.rag.content.Content;
import dev.langchain4j.rag.content.retriever.ContentRetriever;
import dev.langchain4j.rag.query.Query;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 关键字检索器：Hybrid 检索的"精确"那一路——专治向量召不回的**专有名词**
 * （Qdrant / GitHub / admin / kai-toolbox / 编号 等）。
 *
 * <p>从问句抽 latin/数字 token（长度≥2）做 LIKE 全表查；与向量检索器并联进 DefaultQueryRouter，
 * 由 DefaultContentAggregator 做 RRF 融合重排。纯中文问句无 token 时返回空，交给向量路兜。
 */
public class KeywordContentRetriever implements ContentRetriever {

    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9][A-Za-z0-9_.\\-]{1,}");

    private final NoteRepository repo;
    private final int maxResults;

    public KeywordContentRetriever(NoteRepository repo, int maxResults) {
        this.repo = repo;
        this.maxResults = maxResults;
    }

    @Override
    public List<Content> retrieve(Query query) {
        List<String> terms = extractTerms(query.text());
        if (terms.isEmpty()) {
            return List.of();
        }
        return repo.searchByTerms(terms, maxResults).stream()
                .map(Note::rawText)
                .map(Content::from)
                .toList();
    }

    /** 抽取有区分度的 latin/数字关键词（去重保序）。 */
    static List<String> extractTerms(String text) {
        if (text == null) {
            return List.of();
        }
        LinkedHashSet<String> set = new LinkedHashSet<>();
        Matcher m = TOKEN.matcher(text);
        while (m.find()) {
            set.add(m.group());
        }
        return new ArrayList<>(set);
    }
}
