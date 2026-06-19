package com.exceptioncoder.toolbox.aichat.service.tools;

/**
 * 纯 Java 递归下降表达式求值器：支持 + - * / %、括号、一元负号、小数。
 *
 * <p>「确定性优先」取向的体现——数学计算不该交给 LLM 臆测,用代码精确求值。
 * 仅做算术,不引入任何脚本引擎/第三方库,杜绝代码注入面。非法表达式抛
 * {@link IllegalArgumentException},由调用方转成对模型可读的错误。</p>
 */
final class Expr {

    private final String s;
    private int pos = -1;
    private int ch;

    private Expr(String s) {
        this.s = s;
    }

    /** 求值入口;表达式非法或有多余字符时抛 IllegalArgumentException。 */
    static double eval(String expression) {
        if (expression == null || expression.isBlank()) {
            throw new IllegalArgumentException("表达式为空");
        }
        return new Expr(expression).parse();
    }

    private void nextChar() {
        ch = (++pos < s.length()) ? s.charAt(pos) : -1;
    }

    private boolean eat(int charToEat) {
        while (ch == ' ') {
            nextChar();
        }
        if (ch == charToEat) {
            nextChar();
            return true;
        }
        return false;
    }

    private double parse() {
        nextChar();
        double x = parseExpression();
        if (pos < s.length()) {
            throw new IllegalArgumentException("无法解析的字符: '" + (char) ch + "'");
        }
        return x;
    }

    // expression = term | expression '+' term | expression '-' term
    private double parseExpression() {
        double x = parseTerm();
        for (; ; ) {
            if (eat('+')) {
                x += parseTerm();
            } else if (eat('-')) {
                x -= parseTerm();
            } else {
                return x;
            }
        }
    }

    // term = factor | term '*' factor | term '/' factor | term '%' factor
    private double parseTerm() {
        double x = parseFactor();
        for (; ; ) {
            if (eat('*')) {
                x *= parseFactor();
            } else if (eat('/')) {
                double d = parseFactor();
                if (d == 0) {
                    throw new IllegalArgumentException("除数为 0");
                }
                x /= d;
            } else if (eat('%')) {
                double d = parseFactor();
                if (d == 0) {
                    throw new IllegalArgumentException("取模除数为 0");
                }
                x %= d;
            } else {
                return x;
            }
        }
    }

    // factor = '+' factor | '-' factor | '(' expression ')' | number
    private double parseFactor() {
        if (eat('+')) {
            return parseFactor();
        }
        if (eat('-')) {
            return -parseFactor();
        }
        double x;
        int startPos = this.pos;
        if (eat('(')) {
            x = parseExpression();
            if (!eat(')')) {
                throw new IllegalArgumentException("缺少右括号");
            }
        } else if ((ch >= '0' && ch <= '9') || ch == '.') {
            while ((ch >= '0' && ch <= '9') || ch == '.') {
                nextChar();
            }
            x = Double.parseDouble(s.substring(startPos, this.pos));
        } else {
            throw new IllegalArgumentException("非法字符或表达式不完整");
        }
        return x;
    }
}
