import { Location } from "history";
import { AnalysisRuleReport } from "@app/api/models";
import {
  FilterCategory,
  FilterType,
  FilterValue,
} from "@app/shared/components/FilterToolbar";
import {
  deserializeFilterUrlParams,
  serializeFilterUrlParams,
} from "@app/shared/hooks/table-controls";
import { trimAndStringifyUrlParams } from "@app/shared/hooks/useUrlParams";
import { Paths } from "@app/Paths";
import { TableURLParamKeyPrefix } from "@app/Constants";
import { IssueFilterGroups } from "./issues";
import { useFetchBusinessServices } from "@app/queries/businessservices";
import { useFetchTags } from "@app/queries/tags";
import { useTranslation } from "react-i18next";

// Certain filters are shared between the Issues page and the Affected Applications Page.
// We carry these filter values between the two pages when determining the URLs to navigate between them.
// It is also important to restore any unrelated params when returning to the Issues page.

const filterKeysToCarry = [
  "application.name",
  "businessService.name",
  "tag.id",
] as const;
type FilterKeyToCarry = (typeof filterKeysToCarry)[number];
type FilterValuesToCarry = Partial<Record<FilterKeyToCarry, FilterValue>>;

export const useSharedFilterCategoriesForIssuesAndAffectedApps =
  (): FilterCategory<unknown, FilterKeyToCarry>[] => {
    const { t } = useTranslation();
    const { tags } = useFetchTags();
    const { businessServices } = useFetchBusinessServices();

    return [
      {
        key: "application.name",
        title: t("terms.applicationName"),
        filterGroup: IssueFilterGroups.ApplicationInventory,
        type: FilterType.search,
        placeholderText:
          t("actions.filterBy", {
            what: t("terms.applicationName").toLowerCase(),
          }) + "...",
        getServerFilterValue: (value) => (value ? [`*${value[0]}*`] : []),
      },
      {
        key: "businessService.name",
        title: t("terms.businessService"),
        filterGroup: IssueFilterGroups.ApplicationInventory,
        placeholderText:
          t("actions.filterBy", {
            what: t("terms.businessService").toLowerCase(),
          }) + "...",
        type: FilterType.select,
        selectOptions: businessServices
          .map((businessService) => businessService.name)
          .map((name) => ({ key: name, value: name })),
      },
      {
        key: "tag.id",
        title: t("terms.tags"),
        filterGroup: IssueFilterGroups.ApplicationInventory,
        type: FilterType.multiselect,
        placeholderText:
          t("actions.filterBy", {
            what: t("terms.tagName").toLowerCase(),
          }) + "...",
        selectOptions: [...new Set(tags.map((tag) => tag.name))].map(
          (tagName) => ({ key: tagName, value: tagName })
        ),
        // NOTE: The same tag name can appear in multiple tag categories.
        //       To replicate the behavior of the app inventory page, selecting a tag name
        //       will perform an OR filter matching all tags with that name across tag categories.
        //       In the future we may instead want to present the tag select options to the user in category sections.
        getServerFilterValue: (tagNames) =>
          tagNames?.flatMap((tagName) =>
            tags
              .filter((tag) => tag.name === tagName)
              .map((tag) => String(tag.id))
          ),
      },
    ];
  };

const FROM_ISSUES_PARAMS_KEY = "~fromIssuesParams"; // ~ prefix sorts it at the end of the URL for readability

// URL for Affected Apps page that includes carried filters and a snapshot of original URL params from the Issues page
export const getAffectedAppsUrl = ({
  ruleReport,
  fromFilterValues,
  fromLocation,
}: {
  ruleReport: AnalysisRuleReport;
  fromFilterValues: FilterValuesToCarry;
  fromLocation: Location;
}) => {
  // The raw location.search string (already encoded) from the issues page is used as the fromIssuesParams param
  const fromIssuesParams = fromLocation.search;
  const toFilterValues: FilterValuesToCarry = {};
  filterKeysToCarry.forEach((key) => {
    if (fromFilterValues[key]) toFilterValues[key] = fromFilterValues[key];
  });
  const baseUrl = Paths.issuesAllAffectedApplications
    .replace("/:ruleset/", `/${ruleReport.ruleset}/`)
    .replace("/:rule/", `/${ruleReport.rule}/`);
  const prefix = (key: string) =>
    `${TableURLParamKeyPrefix.affectedApps}:${key}`;
  return `${baseUrl}?${trimAndStringifyUrlParams({
    newPrefixedSerializedParams: {
      [prefix("filters")]: serializeFilterUrlParams(toFilterValues).filters,
      [FROM_ISSUES_PARAMS_KEY]: fromIssuesParams,
      ruleReportName: ruleReport.name,
    },
  })}`;
};

// URL for Issues page that restores original URL params and overrides them with any changes to the carried filters.
export const getBackToAllIssuesUrl = ({
  fromFilterValues,
  fromLocation,
}: {
  fromFilterValues: FilterValuesToCarry;
  fromLocation: Location;
}) => {
  // Pull the fromIssuesParams param out of the current location's URLSearchParams
  const fromIssuesParams =
    new URLSearchParams(fromLocation.search).get(FROM_ISSUES_PARAMS_KEY) || "";
  // Pull the params themselves out of fromIssuesParams
  const prefixedParamsToRestore = Object.fromEntries(
    new URLSearchParams(fromIssuesParams)
  );
  // Pull the filters param out of that
  const filterValuesToRestore = deserializeFilterUrlParams({
    filters: prefixedParamsToRestore["issues:filters"],
  });
  // For each of the filters we care about, override the original value with the one from the affected apps page.
  // This will carry over changes including the filter having been cleared.
  filterKeysToCarry.forEach((key) => {
    filterValuesToRestore[key] = fromFilterValues[key] || null;
  });
  // Put it all back together
  const prefix = (key: string) => `${TableURLParamKeyPrefix.issues}:${key}`;
  return `${Paths.issuesAllTab}?${trimAndStringifyUrlParams({
    newPrefixedSerializedParams: {
      ...prefixedParamsToRestore,
      [prefix("filters")]: serializeFilterUrlParams(filterValuesToRestore)
        .filters,
    },
  })}`;
};

export const parseRuleReportLabels = (ruleReport: AnalysisRuleReport) => {
  const sources: string[] = [];
  const targets: string[] = [];
  const otherLabels: string[] = [];
  ruleReport.labels.forEach((label) => {
    if (label.startsWith("konveyor.io/source=")) {
      sources.push(label.split("konveyor.io/source=")[1]);
    } else if (label.startsWith("konveyor.io/target=")) {
      targets.push(label.split("konveyor.io/target=")[1]);
    } else {
      otherLabels.push(label);
    }
  });
  return { sources, targets, otherLabels };
};
