# Legal basis

Evenkeel implements calculations and documents from **Directive (EU) 2023/970**
of the European Parliament and of the Council of 10 May 2023 to strengthen the
application of the principle of equal pay for equal work or work of equal value
between men and women through pay transparency and enforcement mechanisms
(OJ L 132, 17.5.2023, p. 21).

- Official text (all languages): <https://eur-lex.europa.eu/eli/dir/2023/970/oj>
- English HTML used for the quotes below: <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970>

The quotes below are copied from the official English text on EUR-Lex
(retrieved 8 November 2026). Only the provisions the code relies on are
quoted. A directive binds Member States: employers are bound by the national
law that transposes it (Article 34(1): by 7 June 2026). National law may
differ in detail and may go further. This document is not legal advice.

## How the code maps to the law

| Provision | What it says (short) | Where in the code |
|---|---|---|
| [Art. 3(1)(a)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_3) | Pay = basic or minimum wage or salary + complementary or variable components | `columns.basicPay`, `columns.complementaryPay`; `src/core/dataset.ts` |
| Art. 3(1)(b); [recital 22](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#rct_22) | Pay level = gross annual pay and the corresponding gross hourly pay | `payBases`, `annualPay`; `payLevels()` in `src/core/indicators.ts` |
| Art. 3(1)(c) | Gender pay gap = difference in average pay levels as % of the male average | `gapPercent()` in `src/core/indicators.ts` |
| Art. 3(1)(d), (e) | Median pay level; median gender pay gap | `median()`, `medianGenderPayGap` |
| Art. 3(1)(f) | Quartile pay band = four equal groups from lowest to highest pay | `quartileMethod`; `src/core/quartiles.ts` |
| Art. 3(1)(g), (h); Art. 4(4) | Work of equal value; category of workers, defined by the employer on gender-neutral criteria | `columns.category` (taken as given) |
| [Art. 5(1)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_5) | Initial pay or its range for applicants | `salaryRangeText()` |
| [Art. 6(1)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_6) | Criteria for pay, pay levels and pay progression accessible to workers | `payCriteriaStatement()` |
| [Art. 7(1), (3), (4)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_7) | Worker's right to information; yearly notice; answer within two months | `informationRequestResponse()`, `annualInformationNotice()` |
| [Art. 9(1)(a)–(g)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_9) | The seven indicators | `computeIndicators()` |
| Art. 9(2)–(5) | Who reports and when | `reportingObligation()` |
| [Art. 10(1)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_10) | Joint pay assessment: 5 % difference, not justified, not remedied within six months | `jointAssessmentThreshold`, `assessJointPayAssessment()` |
| [Art. 12](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_12); recital 44 | Data protection; identifiable workers | small-group protection (`minimumGroupSize`), local processing |
| [Art. 34(1)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_34) | Transposition by 7 June 2026 | `DIRECTIVE.transpositionDeadline` |

## What the directive leaves open, and how Evenkeel handles it

The directive does not settle the points below. Evenkeel never chooses
silently: each is a configuration setting without a default (or, for purely
technical points, with a documented default), and every report lists the
choices made. See [configuration.md](configuration.md).

| Open point | Setting | Why it is open |
|---|---|---|
| Annual, hourly or both bases in the report | `payBases` | Art. 3(1)(b) defines pay level as both; national law may specify how to present them. |
| Actual annual pay or full-time-equivalent annual pay for part-time and part-year workers | `annualPay` | Recital 22 allows basing pay levels on the actual pay; the directive does not say whether to scale. |
| Which hours define hourly pay | `columns.hours` | Not defined in the directive. |
| Which pay elements are complementary or variable | `columns.complementaryPay` | Recital 21 gives examples, "not limited to". |
| How categories of workers are formed | `columns.category` | Employer, with workers' representatives, under Art. 3(1)(h) and 4(4). |
| Workers recorded as neither female nor male | `otherGender` | Art. 9(1) indicators compare female and male workers; recital 6 leaves national gender recognition rules unaffected. |
| Population for the gap in complementary or variable components | `complementaryGapPopulation` | Art. 9(1)(b) and (d) do not say whether workers without such components count. |
| Splitting four equal groups when the number of workers is not a multiple of four, and ties at band boundaries | `quartileMethod` | Art. 3(1)(f) says only "four equal groups". |
| Median of an even number of workers | fixed: midpoint of the two middle values | Art. 3(1)(d): "half … earn more and half … earn less" holds for any value between the two middle values; the midpoint is the usual convention. |
| Direction and base of the 5 % difference in Art. 10(1)(a) | fixed: absolute difference as % of the male average, on any configured basis | Art. 10(1)(a) does not state the base or the basis; the male-average base follows the Art. 3(1)(c) definition. |
| Size of a group whose figures may be shown | `minimumGroupSize` (default 5) | Art. 12(3) lets Member States restrict access where an identifiable worker's pay would be disclosed. |
| How workers are counted for the size bands | input to `reportingObligation()` | National law. |
| How "within six months" and "within two months" are counted | fixed: same calendar day, clamped to month end, marked indicative | National rules on time periods apply. |

## Notes on the text

- Article 3 does not define "pay progression". Recital 35 describes it: "Pay
  progression refers to the process of how a worker moves to a higher pay
  level." Evenkeel uses the term only in the Article 6(1) statement helper.
- Article 9(1)(g) asks for the gap "by categories of workers broken down by
  ordinary basic wage or salary and complementary or variable components".
  Evenkeel reports, per category, the gap in basic pay, the gap in
  complementary or variable components and, for Article 10(1)(a), the gap in
  total pay (the "average pay level").
- Article 9(1)(a)–(f) may be published by the employer (Article 9(7)); point
  (g) goes to all workers and their representatives (Article 9(9)).

## Quoted provisions

### Article 3 – Definitions

<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_3>

> 1. For the purposes of this Directive, the following definitions apply:
>
> (a) ‘pay’ means the ordinary basic or minimum wage or salary and any other consideration, whether in cash or in kind, which a worker receives directly or indirectly (complementary or variable components) in respect of his or her employment from his or her employer;
>
> (b) ‘pay level’ means gross annual pay and the corresponding gross hourly pay;
>
> (c) ‘gender pay gap’ means the difference in average pay levels between female and male workers of an employer expressed as a percentage of the average pay level of male workers;
>
> (d) ‘median pay level’ means the pay level at which half of the workers of an employer earn more and half of them earn less;
>
> (e) ‘median gender pay gap’ means the difference between the median pay level of female and median pay level of male workers of an employer expressed as a percentage of the median pay level of male workers;
>
> (f) ‘quartile pay band’ means each of four equal groups of workers into which they are divided according to their pay levels, from the lowest to the highest;
>
> (g) ‘work of equal value’ means work that is determined to be of equal value in accordance with the non-discriminatory and objective gender-neutral criteria referred to in Article 4(4);
>
> (h) ‘category of workers’ means workers performing the same work or work of equal value grouped in a non-arbitrary manner based on the non-discriminatory and objective gender-neutral criteria referred to in Article 4(4), by the workers’ employer and, where applicable, in cooperation with the workers’ representatives in accordance with national law and/or practice.
>
> [points (i)–(m) and paragraphs 2 and 3 omitted]

### Article 4 – Equal work and work of equal value

<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_4>

> 1. Member States shall take the necessary measures to ensure that employers have pay structures ensuring equal pay for equal work or work of equal value.
>
> 2. Member States shall, in consultation with equality bodies, take the necessary measures to ensure that analytical tools or methodologies are made available and are easily accessible to support and guide the assessment and comparison of the value of work in accordance with the criteria set out in this Article. Those tools or methodologies shall allow employers and/or the social partners to easily establish and use gender-neutral job evaluation and classification systems that exclude any pay discrimination on grounds of sex.
>
> 3. Where appropriate, the Commission may update Union-wide guidelines related to gender-neutral job evaluation and classification systems, in consultation with the European Institute for Gender Equality (EIGE).
>
> 4. Pay structures shall be such as to enable the assessment of whether workers are in a comparable situation in regard to the value of work on the basis of objective, gender-neutral criteria agreed with workers’ representatives where such representatives exist. Those criteria shall not be based directly or indirectly on workers’ sex. They shall include skills, effort, responsibility and working conditions, and, if appropriate, any other factors which are relevant to the specific job or position. They shall be applied in an objective gender-neutral manner, excluding any direct or indirect discrimination based on sex. In particular, relevant soft skills shall not be undervalued.

### Article 5 – Pay transparency prior to employment

<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_5>

> 1. Applicants for employment shall have the right to receive, from the prospective employer, information about:
>
> (a) the initial pay or its range, based on objective, gender-neutral criteria, to be attributed for the position concerned; and
>
> (b) where applicable, the relevant provisions of the collective agreement applied by the employer in relation to the position.
>
> Such information shall be provided in a manner such as to ensure an informed and transparent negotiation on pay, such as in a published job vacancy notice, prior to the job interview or otherwise.
>
> 2. An employer shall not ask applicants about their pay history during their current or previous employment relationships.
>
> 3. Employers shall ensure that job vacancy notices and job titles are gender-neutral and that recruitment processes are led in a non-discriminatory manner, in order not to undermine the right to equal pay for equal work or work of equal value (the ‘right to equal pay’).

### Article 6 – Transparency of pay setting and pay progression policy

<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_6>

> 1. Employers shall make easily accessible to their workers the criteria that are used to determine workers’ pay, pay levels and pay progression. Those criteria shall be objective and gender neutral.
>
> 2. Member States may exempt employers with fewer than 50 workers from the obligation related to the pay progression set out in paragraph 1.

### Article 7 – Right to information

<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_7>

> 1. Workers shall have the right to request and receive in writing, in accordance with paragraphs 2 and 4, information on their individual pay level and the average pay levels, broken down by sex, for categories of workers performing the same work as them or work of equal value to theirs.
>
> 2. Workers shall have the possibility to request and receive the information referred to in paragraph 1 through their workers’ representatives, in accordance with national law and/or practice. They shall also have the possibility to request and receive the information through an equality body.
>
> If the information received is inaccurate or incomplete, workers shall have the right to request, personally or through their workers’ representatives, additional and reasonable clarifications and details regarding any of the data provided and receive a substantiated reply.
>
> 3. Employers shall inform all workers, on an annual basis, of their right to receive the information referred to in paragraph 1 and of the steps that the worker is to undertake to exercise that right.
>
> 4. Employers shall provide the information referred to in paragraph 1 within a reasonable period of time but in any event within two months from the date on which the request is made.
>
> 5. Workers shall not be prevented from disclosing their pay for the purpose of the enforcement of the principle of equal pay. In particular, Member States shall put in place measures to prohibit contractual terms that restrict workers from disclosing information about their pay.
>
> 6. Employers may require workers who have obtained information pursuant to this Article, other than information concerning their own pay or pay level, not to use that information for any purpose other than to exercise their right to equal pay.

### Article 9 – Reporting on pay gap between female and male workers

<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_9>

> 1. Member States shall ensure that employers provide the following information concerning their organisation, in accordance with this Article:
>
> (a) the gender pay gap;
>
> (b) the gender pay gap in complementary or variable components;
>
> (c) the median gender pay gap;
>
> (d) the median gender pay gap in complementary or variable components;
>
> (e) the proportion of female and male workers receiving complementary or variable components;
>
> (f) the proportion of female and male workers in each quartile pay band;
>
> (g) the gender pay gap between workers by categories of workers broken down by ordinary basic wage or salary and complementary or variable components.
>
> 2. Employers with 250 workers or more shall, by 7 June 2027 and every year thereafter, provide the information set out in paragraph 1 relating to the previous calendar year.
>
> 3. Employers with 150 to 249 workers shall, by 7 June 2027 and every three years thereafter, provide the information set out in paragraph 1 relating to the previous calendar year.
>
> 4. Employers with 100 to 149 workers shall, by 7 June 2031 and every three years thereafter, provide the information set out in paragraph 1 relating to the previous calendar year.
>
> 5. Member States shall not prevent employers with fewer than 100 workers from providing the information set out in paragraph 1 on a voluntary basis. Member States may, as a matter of national law, require employers with fewer than 100 workers to provide information on pay.
>
> 6. The accuracy of the information shall be confirmed by the employer’s management, after consulting workers’ representatives. Workers’ representatives shall have access to the methodologies applied by the employer.
>
> 7. The information referred to in paragraph 1, points (a) to (g), of this Article shall be communicated to the authority in charge of compiling and publishing such data pursuant to Article 29(3), point (c). The employer may publish the information referred to in paragraph 1, points (a) to (f), of this Article on its website or make it publicly available in another manner.
>
> 8. Member States may compile the information set out in paragraph 1, points (a) to (f), of this Article themselves, on the basis of administrative data such as data provided by employers to the tax or social security authorities. The information shall be made public pursuant to Article 29(3), point (c).
>
> 9. Employers shall provide the information referred to in paragraph 1, point (g), to all their workers and to the workers’ representatives of their workers. Employers shall provide the information to the labour inspectorate and the equality body upon request. The information from the previous four years, if available, shall also be provided upon request.
>
> 10. Workers, workers’ representatives, labour inspectorates and equality bodies shall have the right to ask employers for additional clarifications and details regarding any of the data provided, including explanations concerning any gender pay differences. Employers shall respond to such requests within a reasonable time by providing a substantiated reply. Where gender pay differences are not justified on the basis of objective, gender-neutral criteria, employers shall remedy the situation within a reasonable period of time in close cooperation with workers’ representatives, the labour inspectorate and/or the equality body.

### Article 10 – Joint pay assessment

<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_10>

> 1. Member States shall take appropriate measures to ensure that employers who are subject to pay reporting pursuant to Article 9 conduct, in cooperation with their workers’ representatives, a joint pay assessment where all the following conditions are met:
>
> (a) the pay reporting demonstrates a difference in the average pay level between female and male workers of at least 5 % in any category of workers;
>
> (b) the employer has not justified such a difference in the average pay level on the basis of objective, gender-neutral criteria;
>
> (c) the employer has not remedied such an unjustified difference in the average pay level within six months of the date of submission of the pay reporting.
>
> 2. The joint pay assessment shall be carried out in order to identify, remedy and prevent differences in pay between female and male workers which are not justified on the basis of objective, gender-neutral criteria, and shall include the following:
>
> (a) an analysis of the proportion of female and male workers in each category of workers;
>
> (b) information on average female and male workers’ pay levels and complementary or variable components for each category of workers;
>
> (c) any differences in average pay levels between female and male workers in each category of workers;
>
> (d) the reasons for such differences in average pay levels, on the basis of objective, gender-neutral criteria, if any, as established jointly by the workers’ representatives and the employer;
>
> (e) the proportion of female and male workers who benefited from any improvement in pay following their return from maternity or paternity leave, parental leave or carers’ leave, if such improvement occurred in the relevant category of workers during the period in which the leave was taken;
>
> (f) measures to address differences in pay if they are not justified on the basis of objective, gender-neutral criteria;
>
> (g) an evaluation of the effectiveness of measures from previous joint pay assessments.
>
> 3. Employers shall make the joint pay assessment available to workers and workers’ representatives and shall communicate it to the monitoring body pursuant to Article 29(3), point (d). They shall make it available to the labour inspectorate and the equality body upon request.
>
> 4. When implementing the measures arising from the joint pay assessment, the employer shall remedy the unjustified differences in pay within a reasonable period of time, in close cooperation, in accordance with national law and/or practice, with the workers’ representatives. The labour inspectorate and/or the equality body may be asked to participate in the process. The implementation of the measures shall include an analysis of the existing gender-neutral job evaluation and classification systems or the establishment of such systems, to ensure that any direct or indirect pay discrimination on the grounds of sex is excluded.

### Article 12 – Data protection

<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_12>

> 1. To the extent that any information provided pursuant to measures taken under Articles 7, 9, and 10 involves the processing of personal data, it shall be provided in accordance with Regulation (EU) 2016/679.
>
> 2. Any personal data processed pursuant to Articles 7, 9 or 10 of this Directive shall not be used for any purpose other than for the application of the principle of equal pay.
>
> 3. Member States may decide that, where the disclosure of information pursuant to Articles 7, 9 and 10 would lead to the disclosure, either directly or indirectly, of the pay of an identifiable worker, only the workers’ representatives, the labour inspectorate or the equality body shall have access to that information. The workers’ representatives or the equality body shall advise workers regarding a possible claim under this Directive without disclosing actual pay levels of individual workers performing the same work or work of equal value. For the purposes of monitoring pursuant to Article 29, the information shall be made available without restriction.

### Article 34 – Transposition

<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#art_34>

> 1. Member States shall bring into force the laws, regulations and administrative provisions necessary to comply with this Directive by 7 June 2026. They shall immediately inform the Commission thereof.
>
> When informing the Commission, Member States shall also provide it with a summary of the results of an assessment regarding the impact of their transposition measures on workers and employers with fewer than 250 workers and a reference to where such assessment is published.
>
> 2. When Member States adopt the measures referred to in paragraph 1 they shall contain a reference to this Directive or shall be accompanied by such a reference on the occasion of their official publication. The methods of making such reference shall be laid down by Member States.

### Recitals referred to

**Recital 6** (<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#rct_6>)

> In some Member States, it is currently possible for persons to legally register as having a third, often a neutral, gender. This Directive does not affect relevant national rules giving effect to such recognition as regards matters of employment and pay.

**Recital 21** (<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#rct_21>)

> The principle of equal pay should be observed with regard to wages, salaries or any other consideration, whether in cash or in kind, which workers receive directly or indirectly, in respect of their employment from their employer. In accordance with the case-law of the Court of Justice ( 6 ) , the concept of pay should comprise not only salary, but also complementary or variable components of the pay. Under complementary or variable components, any benefits in addition to the ordinary basic or minimum wage or salary, which the worker receives directly or indirectly, whether in cash or in kind, should be taken into account. Such complementary or variable components may include, but are not limited to, bonuses, overtime compensation, travel facilities, housing and food allowances, compensation for attending training, payments in the case of dismissal, statutory sick pay, statutory required compensation and occupational pensions. The concept of pay should include all elements of remuneration due under law, collective agreements and/or practice in each Member State.

**Recital 22** (<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#rct_22>)

> In order to ensure a uniform presentation of the information required by this Directive, pay levels should be expressed as gross annual pay and the corresponding gross hourly pay. It should be possible to base the calculation of pay levels on the actual pay specified in regard to the worker, regardless of whether it is set annually, monthly, hourly or otherwise.

**Recital 35** (<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#rct_35>)

> Employers should make accessible to workers the criteria that are used to determine pay levels and pay progression. Pay progression refers to the process of how a worker moves to a higher pay level. Criteria related to pay progression can include, inter alia , individual performance, skills development and seniority. When implementing this obligation, Member States should pay particular attention to avoiding excessive administrative burden for micro and small enterprises. Member States should also be able to provide, as a mitigating measure, ready-made templates to support micro and small enterprises in complying with the obligation. Member States should be able to exempt employers which are micro or small enterprises from the obligation related to pay progression, for instance by allowing them to make the pay progression criteria available upon request by workers.

**Recital 43** (<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#rct_43>)

> Joint pay assessments should trigger the review and revision of pay structures in organisations with at least 100 workers that show pay inequalities. The joint pay assessment should be carried out if employers and the workers’ representatives concerned do not agree that the difference in average pay level between female and male workers of at least 5 % in a given category of workers can be justified on the basis of objective, gender-neutral criteria, if such a justification is not provided by the employer, or if the employer has not remedied such a difference in pay level within six months of the date of submission of the pay reporting. The joint pay assessment should be carried out by employers in cooperation with workers’ representatives. If there are no workers’ representatives, they should be designated by workers for the purpose of the joint pay assessment. Joint pay assessments should lead, within a reasonable period of time, to the elimination of gender-based pay discrimination through the adoption of remedial measures.

**Recital 44** (<https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#rct_44>)

> Any processing or publication of information under this Directive should comply with Regulation (EU) 2016/679 of the European Parliament and of the Council ( 14 ) . Specific safeguards should be added to prevent the direct or indirect disclosure of information of an identifiable worker. Workers should not be prevented from voluntarily disclosing their pay for the purpose of the enforcement of the principle of equal pay.
