/*
 * Copyright (C) 2015 Apple Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. AND ITS CONTRIBUTORS ``AS IS''
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 * THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL APPLE INC. OR ITS CONTRIBUTORS
 * BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
 * THE POSSIBILITY OF SUCH DAMAGE.
 */

WI.ContentBrowserTabContentView = class ContentBrowserTabContentView extends WI.TabContentView
{
    constructor(identifier, styleClassNames, tabBarItem, navigationSidebarPanelConstructor, detailsSidebarPanelConstructors, disableBackForward, flexibleNavigationItem)
    {
        if (typeof styleClassNames === "string")
            styleClassNames = [styleClassNames];

        styleClassNames.push("content-browser");

        var contentBrowser = new WI.ContentBrowser(null, null, disableBackForward, false, flexibleNavigationItem);

        super(identifier, styleClassNames, tabBarItem, navigationSidebarPanelConstructor, detailsSidebarPanelConstructors);

        this._contentBrowser = contentBrowser;
        this._contentBrowser.delegate = this;

        this._ignoreNavigationSidebarPanelCollapsedEvent = false;
        this._ignoreDetailsSidebarPanelCollapsedEvent = false;
        this._ignoreDetailsSidebarPanelSelectedEvent = false;

        this._lastSelectedDetailsSidebarPanelSetting = new WI.Setting(identifier + "-last-selected-details-sidebar-panel", null);

        this._contentBrowser.addEventListener(WI.ContentBrowser.Event.CurrentRepresentedObjectsDidChange, this._contentBrowserCurrentRepresentedObjectsDidChange, this);
        this._contentBrowser.addEventListener(WI.ContentBrowser.Event.CurrentContentViewDidChange, this._contentBrowserCurrentContentViewDidChange, this);

        // If any content views were shown during sidebar construction, contentBrowserTreeElementForRepresentedObject() would have returned null.
        // Explicitly update the path for the navigation bar to prevent it from showing up as blank.
        this._contentBrowser.updateHierarchicalPathForCurrentContentView();

        if (navigationSidebarPanelConstructor) {
            let showToolTip = WI.UIString("Show the navigation sidebar (%s)").format(WI.navigationSidebarKeyboardShortcut.displayName);
            let hideToolTip = WI.UIString("Hide the navigation sidebar (%s)").format(WI.navigationSidebarKeyboardShortcut.displayName);
            let image = WI.resolvedLayoutDirection() === WI.LayoutDirection.RTL ? "Images/ToggleRightSidebar.svg" : "Images/ToggleLeftSidebar.svg";

            this._showNavigationSidebarItem = new WI.ActivateButtonNavigationItem("toggle-navigation-sidebar", showToolTip, hideToolTip, image, 16, 16);
            this._showNavigationSidebarItem.addEventListener(WI.ButtonNavigationItem.Event.Clicked, WI.toggleNavigationSidebar, WI);
            this._showNavigationSidebarItem.activated = !WI.navigationSidebar.collapsed;
            this._showNavigationSidebarItem.visibilityPriority = WI.NavigationItem.VisibilityPriority.High;

            this._contentBrowser.navigationBar.insertNavigationItem(this._showNavigationSidebarItem, 0);
            this._contentBrowser.navigationBar.insertNavigationItem(new WI.DividerNavigationItem, 1);

            WI.navigationSidebar.addEventListener(WI.Sidebar.Event.CollapsedStateDidChange, this._navigationSidebarCollapsedStateDidChange, this);
        }

        if (detailsSidebarPanelConstructors && detailsSidebarPanelConstructors.length) {
            let showToolTip = WI.UIString("Show the details sidebar (%s)").format(WI.detailsSidebarKeyboardShortcut.displayName);
            let hideToolTip = WI.UIString("Hide the details sidebar (%s)").format(WI.detailsSidebarKeyboardShortcut.displayName);
            let image = WI.resolvedLayoutDirection() === WI.LayoutDirection.RTL ? "Images/ToggleLeftSidebar.svg" : "Images/ToggleRightSidebar.svg";

            this._showDetailsSidebarItem = new WI.ActivateButtonNavigationItem("toggle-details-sidebar", showToolTip, hideToolTip, image, 16, 16);
            this._showDetailsSidebarItem.addEventListener(WI.ButtonNavigationItem.Event.Clicked, WI.toggleDetailsSidebar, WI);
            this._showDetailsSidebarItem.activated = !WI.detailsSidebar.collapsed;
            this._showDetailsSidebarItem.enabled = false;
            this._showDetailsSidebarItem.visibilityPriority = WI.NavigationItem.VisibilityPriority.High;

            this._contentBrowser.navigationBar.addNavigationItem(new WI.DividerNavigationItem);
            this._contentBrowser.navigationBar.addNavigationItem(this._showDetailsSidebarItem);

            WI.detailsSidebar.addEventListener(WI.Sidebar.Event.CollapsedStateDidChange, this._detailsSidebarCollapsedStateDidChange, this);
            WI.detailsSidebar.addEventListener(WI.Sidebar.Event.SidebarPanelSelected, this._detailsSidebarPanelSelected, this);
        }

        this.addSubview(this._contentBrowser);
    }

    // Public

    get contentBrowser()
    {
        return this._contentBrowser;
    }

    shown()
    {
        if (this.navigationSidebarPanel) {
            if (!this.navigationSidebarPanel.contentBrowser)
                this.navigationSidebarPanel.contentBrowser = this._contentBrowser;
        }

        super.shown();

        this._contentBrowser.shown();

        if (this.navigationSidebarPanel) {
            if (!this._contentBrowser.currentContentView)
                this.navigationSidebarPanel.showDefaultContentView();
        }
    }

    hidden()
    {
        super.hidden();

        this._contentBrowser.hidden();
    }

    closed()
    {
        super.closed();

        WI.navigationSidebar.removeEventListener(null, null, this);
        WI.detailsSidebar.removeEventListener(null, null, this);

        if (this.navigationSidebarPanel && typeof this.navigationSidebarPanel.closed === "function")
            this.navigationSidebarPanel.closed();

        this._contentBrowser.contentViewContainer.closeAllContentViews();
    }

    get managesDetailsSidebarPanels()
    {
        return true;
    }

    showNavigationSidebarPanel()
    {
        if (!this.visible)
            return;

        if (!this.navigationSidebarPanel)
            return;

        this._ignoreNavigationSidebarPanelCollapsedEvent = true;

        let currentRepresentedObjects = this._contentBrowser.currentRepresentedObjects;
        let shouldShowSidebar = currentRepresentedObjects.some((object) => this.navigationSidebarPanel.canShowRepresentedObject(object));

        if (shouldShowSidebar) {
            if (!this.navigationSidebarPanel.parentSidebar)
                WI.navigationSidebar.addSidebarPanel(this.navigationSidebarPanel);
        } else if (this.navigationSidebarPanel.parentSidebar)
            WI.navigationSidebar.removeSidebarPanel(this.navigationSidebarPanel);

        if (this.navigationSidebarPanel.parentSidebar) {
            WI.navigationSidebar.selectedSidebarPanel = this.navigationSidebarPanel;
            WI.navigationSidebar.collapsed = this.navigationSidebarCollapsedSetting.value;
        } else
            WI.navigationSidebar.collapsed = true;

        this._ignoreNavigationSidebarPanelCollapsedEvent = false;

        this._showNavigationSidebarItem.enabled = !!this.navigationSidebarPanel.parentSidebar;
    }

    showDetailsSidebarPanels()
    {
        if (!this.visible)
            return;

        var currentRepresentedObjects = this._contentBrowser.currentRepresentedObjects;
        var currentSidebarPanels = WI.detailsSidebar.sidebarPanels;
        var wasSidebarEmpty = !currentSidebarPanels.length;

        // Ignore any changes to the selected sidebar panel during this function so only user initiated
        // changes are recorded in _lastSelectedDetailsSidebarPanelSetting.
        this._ignoreDetailsSidebarPanelSelectedEvent = true;
        this._ignoreDetailsSidebarPanelCollapsedEvent = true;

        let hiddenSidebarPanels = 0;

        for (var i = 0; i < this.detailsSidebarPanels.length; ++i) {
            var sidebarPanel = this.detailsSidebarPanels[i];
            if (sidebarPanel.inspect(currentRepresentedObjects)) {
                if (currentSidebarPanels.includes(sidebarPanel)) {
                    // Already showing the panel.
                    continue;
                }

                // The sidebar panel was not previously showing, so add the panel.
                let index = i - hiddenSidebarPanels;
                WI.detailsSidebar.insertSidebarPanel(sidebarPanel, index);

                if (this._lastSelectedDetailsSidebarPanelSetting.value === sidebarPanel.identifier) {
                    // Restore the sidebar panel selection if this sidebar panel was the last one selected by the user.
                    WI.detailsSidebar.selectedSidebarPanel = sidebarPanel;
                }
            } else {
                // The sidebar panel can't inspect the current represented objects, so remove the panel and hide the toolbar item.
                WI.detailsSidebar.removeSidebarPanel(sidebarPanel);
                hiddenSidebarPanels++;
            }
        }

        if (!WI.detailsSidebar.selectedSidebarPanel && currentSidebarPanels.length)
            WI.detailsSidebar.selectedSidebarPanel = currentSidebarPanels[0];

        if (!WI.detailsSidebar.sidebarPanels.length)
            WI.detailsSidebar.collapsed = true;
        else if (wasSidebarEmpty)
            WI.detailsSidebar.collapsed = this.detailsSidebarCollapsedSetting.value;

        this._ignoreDetailsSidebarPanelCollapsedEvent = false;
        this._ignoreDetailsSidebarPanelSelectedEvent = false;

        if (!this.detailsSidebarPanels.length)
            return;

        this._showDetailsSidebarItem.enabled = WI.detailsSidebar.sidebarPanels.length;
    }

    showRepresentedObject(representedObject, cookie)
    {
        if (this.navigationSidebarPanel)
            this.navigationSidebarPanel.cancelRestoringState();
        this.contentBrowser.showContentViewForRepresentedObject(representedObject, cookie);
    }

    // ContentBrowser Delegate

    contentBrowserTreeElementForRepresentedObject(contentBrowser, representedObject)
    {
        return this.treeElementForRepresentedObject(representedObject);
    }

    // Protected

    treeElementForRepresentedObject(representedObject)
    {
        // Can be overridden by subclasses.

        if (!this.navigationSidebarPanel)
            return null;

        return this.navigationSidebarPanel.treeElementForRepresentedObject(representedObject);
     }

    // Private

    _navigationSidebarCollapsedStateDidChange(event)
    {
        if (!this.visible)
            return;

        this._showNavigationSidebarItem.activated = !WI.navigationSidebar.collapsed;

        if (this._ignoreNavigationSidebarPanelCollapsedEvent)
            return;

        this.navigationSidebarCollapsedSetting.value = WI.navigationSidebar.collapsed;
    }

    _detailsSidebarCollapsedStateDidChange(event)
    {
        if (!this.visible)
            return;

        this._showDetailsSidebarItem.activated = !WI.detailsSidebar.collapsed;
        this._showDetailsSidebarItem.enabled = WI.detailsSidebar.sidebarPanels.length;

        if (this._ignoreDetailsSidebarPanelCollapsedEvent)
            return;

        this.detailsSidebarCollapsedSetting.value = WI.detailsSidebar.collapsed;
    }

    _detailsSidebarPanelSelected(event)
    {
        if (!this.visible)
            return;

        this._showDetailsSidebarItem.activated = !WI.detailsSidebar.collapsed;
        this._showDetailsSidebarItem.enabled = WI.detailsSidebar.sidebarPanels.length;

        if (!WI.detailsSidebar.selectedSidebarPanel || this._ignoreDetailsSidebarPanelSelectedEvent)
            return;

        this._lastSelectedDetailsSidebarPanelSetting.value = WI.detailsSidebar.selectedSidebarPanel.identifier;
    }

    _contentBrowserCurrentContentViewDidChange(event)
    {
        let currentContentView = this._contentBrowser.currentContentView;
        if (!currentContentView)
            return;

        this._revealAndSelectRepresentedObject(currentContentView.representedObject);
    }

    _revealAndSelectRepresentedObject(representedObject)
    {
        if (this.navigationSidebarPanel) {
            // If a tree outline is processing a selection currently then we can assume the selection does not
            // need to be changed. This is needed to allow breakpoint and call frame tree elements to be selected
            // without jumping back to selecting the resource tree element.
            for (let contentTreeOutline of this.navigationSidebarPanel.contentTreeOutlines) {
                if (contentTreeOutline.processingSelectionChange)
                    return;
            }
        }

        let treeElement = this.treeElementForRepresentedObject(representedObject);

        if (treeElement)
            treeElement.revealAndSelect(true, false, true, true);
        else if (this.navigationSidebarPanel && this.navigationSidebarPanel.contentTreeOutline.selectedTreeElement)
            this.navigationSidebarPanel.contentTreeOutline.selectedTreeElement.deselect(true);
    }

    _contentBrowserCurrentRepresentedObjectsDidChange()
    {
        if (this.managesNavigationSidebarPanel)
            this.showNavigationSidebarPanel();
        this.showDetailsSidebarPanels();
    }
};
