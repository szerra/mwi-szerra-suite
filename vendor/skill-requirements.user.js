// ==UserScript==
// @name         MWI QoL 技能需求
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  比對目前技能等級與物品需求，支援新版提示框、繁簡中文與英文。
// @author       GodofTheFallen
// @author       AlexZaw
// @license      MIT License
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// ==/UserScript==

(function () {
    'use strict';

    const levelNotEnoughColor = 'red';
    const levelEnoughColor = 'blue';

    const selectors = {
        tooltipPopper: '.MuiTooltip-popper',
        tooltipText: '[class*="ItemTooltipText_itemTooltipText__"]',
        equipmentDetail: '[class*="ItemTooltipText_equipmentDetail__"]',
        abilityDetail: '[class*="ItemTooltipText_abilityDetail__"]',
        navigationLinks: '[class*="NavigationBar_navigationLinks__"]',
        navigationLabel: '[class*="NavigationBar_label__"]',
        navigationLevel: '[class*="NavigationBar_level__"]',
        totalLevel: '[class*="Header_totalLevel__"]',
    };

    const requiredLevelItemStyle = document.createElement('style');
    requiredLevelItemStyle.textContent = `
      :where(${selectors.tooltipText})
      :where(${selectors.equipmentDetail}, ${selectors.abilityDetail})
      > div:nth-child(2) {
        color: ${levelEnoughColor};
      }
    `;
    document.head.appendChild(requiredLevelItemStyle);

    let mainScheduled = false;

    const observer = new MutationObserver((changes) => {
        if (!changes.some(mutationTouchesTooltip)) {
            return;
        }
        scheduleMain();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    scheduleMain();

    function mutationTouchesTooltip(change) {
        const target = change.target?.nodeType === Node.ELEMENT_NODE
            ? change.target
            : null;

        if (target?.closest?.(selectors.tooltipPopper)) {
            return true;
        }

        return [...change.addedNodes].some((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) {
                return false;
            }
            return node.matches?.(`${selectors.tooltipPopper}, ${selectors.tooltipText}`) ||
                node.querySelector?.(`${selectors.tooltipPopper}, ${selectors.tooltipText}`);
        });
    }

    function scheduleMain() {
        if (mainScheduled) {
            return;
        }
        mainScheduled = true;
        requestAnimationFrame(() => {
            mainScheduled = false;
            main();
        });
    }

    function main() {
        const visiblePoppers = [...document.querySelectorAll(selectors.tooltipPopper)]
            .filter(isVisible);

        visiblePoppers.forEach((popper) => {
            popper.querySelectorAll(selectors.tooltipText).forEach(processTooltip);
        });
    }

    function isVisible(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
    }

    function processTooltip(tooltipText) {
        const detail = tooltipText.querySelector(
            `${selectors.equipmentDetail}, ${selectors.abilityDetail}`
        );

        if (!detail) {
            return;
        }

        getRequirementElements(detail).forEach((element) => {
            const requirement = parseRequirement(element.textContent);
            if (!requirement) {
                return;
            }

            const enough = requirement.currentLevel >= requirement.requiredLevel;
            element.style.color = enough ? levelEnoughColor : levelNotEnoughColor;
            element.style.fontWeight = enough ? '' : '700';
            element.title = `目前等級: ${requirement.currentLevel} / 需要等級: ${requirement.requiredLevel}`;
        });
    }

    function getRequirementElements(detail) {
        const requirementContainer = detail.children[1];
        if (!requirementContainer) {
            return [];
        }

        const elements = [...requirementContainer.children];
        return elements.length > 0 ? elements : [requirementContainer];
    }

    function parseRequirement(text) {
        const requiredLevelMatch = text.match(/\d[\d,]*/);
        if (!requiredLevelMatch) {
            return null;
        }

        const requiredLevel = Number(requiredLevelMatch[0].replaceAll(',', ''));
        const normalizedRequirement = normalizeText(text);

        if (/total/i.test(text) || normalizedRequirement.includes('总等级') ||
            normalizedRequirement.includes('總等級')) {
            const currentLevel = getTotalLevel();
            return Number.isFinite(currentLevel)
                ? { requiredLevel, currentLevel }
                : null;
        }

        const allSkills = getAllSkillLevels()
            .sort((a, b) => normalizeText(b.name).length - normalizeText(a.name).length);

        const requiredSkill = allSkills.find((skill) =>
            normalizedRequirement.includes(normalizeText(skill.name))
        );

        if (!requiredSkill) {
            return null;
        }

        return {
            requiredLevel,
            currentLevel: requiredSkill.level,
        };
    }

    function normalizeText(text) {
        return String(text)
            .toLowerCase()
            .replace(/[\s:：,，。.!！?？()（）\[\]]/g, '')
            .replace(/levels?/g, '')
            .replace(/[级級]/g, '');
    }

    function getTotalLevel() {
        const totalLevelElement = document.querySelector(selectors.totalLevel);
        const matches = totalLevelElement?.textContent.match(/\d[\d,]*/g);
        if (!matches?.length) {
            return NaN;
        }
        return Number(matches.at(-1).replaceAll(',', ''));
    }

    function getAllSkillLevels() {
        const navigationLinks = document.querySelector(selectors.navigationLinks);
        if (!navigationLinks) {
            return [];
        }

        return [...navigationLinks.querySelectorAll(selectors.navigationLabel)]
            .map((label) => {
                const scope = label.parentElement;
                const levelElement = scope?.querySelector(selectors.navigationLevel);
                const levelMatch = levelElement?.textContent.match(/\d[\d,]*/);

                if (!levelMatch) {
                    return null;
                }

                return {
                    name: label.textContent.trim(),
                    level: Number(levelMatch[0].replaceAll(',', '')),
                };
            })
            .filter(Boolean);
    }
})();
