/**
 * Clusterer for Yandex.Maps.
 * 
 * 2011, aztek <evgeny.kotelnikov@gmail.com>
 */

function PlacemarkClusterer(map, placemarks, options) {
    var clusters_ = [];
    var map = map;
    var maxZoom = 16;
    var self = this;
    var gridSize = 60;
    var leftPlacemarks = [];
    var mcfn = null;
    
    var $ = YMaps.jQuery;

    var style = null;

    if (typeof options === "object" && options !== null) {
        if (typeof options.gridSize === "number" && options.gridSize > 0) {
            gridSize = options.gridSize;
        }
    
        if (typeof options.maxZoom === "number") {
            maxZoom = options.maxZoom;
        }
    
        if (typeof options.style === "object" && options.style !== null && options.style.length !== 0) {
            style = options.style;
        }
    }
    
    // initialize
    if (typeof placemarks === "object" && placemarks !== null) {
        this.addOverlays(placemarks);
    }

    // when map move end, regroup.
    mcfn = YMaps.Events.observe(map, map.Events.Update, function() {
        self.resetViewport();
    });

    this.getStyle = function() {
        return style;
    };

    this.getMaxZoom = function() {
        return maxZoom;
    };

    this.getMap = function() {
        return map;
    };

    this.getGridSize = function() {
        return gridSize;
    };

    this.getTotalClusters = function() {
        return clusters_.length;
    };

    /**
     * When we add a placemark, the placemark may not in the viewport of map, then we don't deal with it, instead
     * we add the placemark into a array called leftPlacemarks. When we reset PlacemarkClusterer we should add the
     * leftPlacemarks into PlacemarkClusterer.
     */
    function addLeftPlacemarks() {
        while (placemark = leftPlacemarks.pop()) {
            self.addPlacemark(placemark, true, null, null, true);
        }
    }

    /**
     * Remove all placemarks from PlacemarkClusterer.
     */
    this.clearPlacemarks = function() {
        while (cluster = clusters_.pop()) {
            if(typeof cluster !== "undefined" && cluster !== null) {
                cluster.clearPlacemarks();
            }
        }
        leftPlacemarks = [];
        mcfn.disable();
    };

    /**
     * Check a placemark, whether it is in current map viewport.
     * @private
     * @return{Boolean} if it is in current map viewport
     */
    function isPlacemarkInViewport(placemark) {
        return map.getBounds().contains(placemark.getCoordPoint());
    }

    /**
     * When reset PlacemarkClusterer, there will be some placemarks get out of its cluster.
     * These placemarks should be add to new clusters.
     * @param{Array of YMaps.Placemark} placemarks Placemarks to add.
     */
    function reAddPlacemarks(placemarks) {
        var newClusters = [];
        $.each(placemarks, function (index, placemark) {
            self.addPlacemark(placemark.placemark, true, placemark.added, newClusters, true);
        });
        addLeftPlacemarks();
    }

    /**
     * Add a placemark.
     * @private
     * @param{YMaps.Placemark} placemark Placemark you want to add
     * @param{Boolean} opt_isNodraw Whether redraw the cluster contained the placemark
     * @param{Boolean} opt_added Whether the placemark is added to map. Never use it.
     * @param{Array of Cluster} opt_clusters Provide a list of clusters, the placemark
     *     cluster will only check these cluster where the placemark should join.
     */
    this.addPlacemark = function(placemark, opt_isNodraw, opt_added, opt_clusters, opt_isNoCheck) {
        if (opt_isNoCheck !== true) {
            if (!isPlacemarkInViewport(placemark)) {
                leftPlacemarks.push(placemark);
                return;
            }
        }

        var added  = opt_added;
        var isNodraw = (opt_isNodraw === true);
        var clusters = opt_clusters;
        var pos = map.converter.coordinatesToMapPixels(placemark.getCoordPoint());
    
        if (typeof added !== "boolean") {
            added = false;
        }
    
        if (typeof clusters !== "object" || clusters === null) {
            clusters = clusters_;
        }

        var cluster = null;
        for (var i = clusters.length; i --> 0 /* :) */;) {
            cluster = clusters[i];
            var center = cluster.getCenter();
            if (center === null) {
                continue;
            }

            center = map.converter.coordinatesToMapPixels(center);

            // Found a cluster which contains the placemark.
            if (pos.x >= center.x - gridSize && pos.x <= center.x + gridSize &&
                pos.y >= center.y - gridSize && pos.y <= center.y + gridSize) {
                cluster.addPlacemark({
                    "added": added,
                    "placemark": placemark
                });
        
                if (!isNodraw) {
                    cluster.redraw();
                }
                return;
            }
        }

        // No cluster contain the placemark, create a new cluster.
        cluster = new Cluster(this, map);
        cluster.addPlacemark({
            "added": added,
            "placemark": placemark
        });
    
        if (!isNodraw) {
            cluster.redraw();
        }

        // Add this cluster both in clusters provided and clusters_
        clusters.push(cluster);
        if (clusters !== clusters_) {
            clusters_.push(cluster);
        }
    };

    /**
     * Remove a placemark.
     *
     * @param{YMaps.Placemark} placemark The placemark you want to remove.
     */
    this.removePlacemark = function(placemark) {
        $.each(clusters_, function (index, cluster) {
            if (cluster.remove(placemark)) {
                cluster.redraw();
                return false;
            }
        });
    };

    /**
     * Redraw all clusters in viewport.
     */
    this.redraw = function() {
        $.each(this.getClustersInViewport(), function (index, cluster) {
            cluster.redraw(true);
        });
    };

    /**
     * Get all clusters in viewport.
     * @return{Array of Cluster}
     */
    this.getClustersInViewport = function() {
        var currentBounds = map.getBounds();
        return $.grep(clusters_, function (cluster) {
            return cluster.isInBounds(currentBounds);
        });
    };

    /**
     * Get total number of placemarks.
     * @return{Number}
     */
    this.getTotalPlacemarks = function() {
        var placemarks = 0;
        $.each(clusters_, function (index, cluster) {
            placemarks += cluster.getTotalPlacemarks();
        });
        return placemarks;
    };

    /**
     * Collect all placemarks of clusters in viewport and regroup them.
     */
    this.resetViewport = function() {
        var tmpPlacemarks = [];
        var currentZoom = map.getZoom();

        $.each(this.getClustersInViewport(), function (index, cluster) {
            if (currentZoom !== cluster.getCurrentZoom()) {
                // If the cluster zoom level changed then destroy the cluster
                // and collect its placemarks.
                tmpPlacemarks.push.apply(tmpPlacemarks, $.map(cluster.getPlacemarks(), function (placemark) {
                    return {
                        "added": false,
                        "placemark": placemark.placemark
                    };
                }));
                
                cluster.clearPlacemarks();

                var clusterIndex = $.inArray(cluster, clusters_);
                if (clusterIndex > -1) {
                    clusters_.splice(clusterIndex, 1);
                }
            }
        });

        // Add the placemarks collected into placemark cluster to reset
        reAddPlacemarks(tmpPlacemarks);
        this.redraw();
    };

    /**
     * Add a set of placemarks.
     *
     * @param{Array of YMaps.Placemark} placemarks The placemarks you want to add.
     */
    this.addOverlays = function(placemarks) {
        $.each(placemarks, function (index, placemark) {
            self.addPlacemark(placemark, true, false);
        });
        this.redraw();
    };

    this.addOverlay = function(placemark) {
        this.addPlacemark(placemark, false, false);
    };
}

/**
 * Create a cluster to collect placemarks.
 * A cluster includes some placemarks which are in a block of area.
 * If there are more than one placemarks in cluster, the cluster
 * will create a{@link YMaps.ClusterPlacemark} and show the total number
 * of placemarks in cluster.
 *
 * @constructor
 * @private
 * @param{PlacemarkClusterer} placemarkClusterer The placemark cluster object
 */
function Cluster(placemarkClusterer) {
    var center = null;
    var placemarks = [];
    var placemarkClusterer = placemarkClusterer;
    var map = placemarkClusterer.getMap();
    var clusterPlacemark = null;
    var zoom = map.getZoom();
    
    var $ = YMaps.jQuery;

    this.getCenter = function() {
        return center;
    };

    this.getPlacemarks = function() {
        return placemarks;
    };
    
    this.getCurrentZoom = function() {
        return zoom;
    };
    
    this.getTotalPlacemarks = function() {
        return placemarks.length;
    };

    /**
     * If this cluster intersects certain bounds.
     *
     * @param{YMaps.Bounds} bounds A bounds to test
     * @return{Boolean} Is this cluster intersects the bounds
     */
    this.isInBounds = function(bounds) {
        if (center === null) {
            return false;
        }

        if (!bounds) {
            bounds = map.getBounds();
        }
    
        var sw = map.converter.coordinatesToMapPixels(bounds.getLeftBottom());
        var ne = map.converter.coordinatesToMapPixels(bounds.getRightTop());

        var centerxy = map.converter.coordinatesToMapPixels(center);
        var inViewport = true;
        var gridSize = placemarkClusterer.getGridSize();
    
        if (zoom !== map.getZoom()) {
            var dl = map.getZoom() - zoom;
            gridSize = Math.pow(2, dl) * gridSize;
        }
        
        if (ne.x !== sw.x && (centerxy.x + gridSize < sw.x || centerxy.x - gridSize > ne.x)) {
            inViewport = false;
        }
        
        if (inViewport && (centerxy.y + gridSize < ne.y || centerxy.y - gridSize > sw.y)) {
            inViewport = false;
        }
        
        return inViewport;
    };

    /**
     * Add a placemark.
     *
     * @param{Object} placemark An object of placemark you want to add:
     *  {Boolean} added If the placemark is added on map.
     *  {YMaps.Placemark} placemark The placemark you want to add.
     */
    this.addPlacemark = function(placemark) {
        if (center === null) {
            center = placemark.placemark.getCoordPoint();
        }
        placemarks.push(placemark);
    };

    /**
     * Remove a placemark from cluster.
     *
     * @param{YMaps.Placemark} placemark The placemark you want to remove.
     * @return{Boolean} Whether find the placemark to be removed.
     */
    this.removePlacemark = function(placemark) {
        for (var i = 0; i < placemarks.length; ++i) {
            if (placemark === placemarks[i].placemark) {
                if (placemarks[i].added) {
                    map.removeOverlay(placemarks[i].placemark);
                }
                placemarks.splice(i, 1);
                return true;
            }
        }
        return false;
    };

    /**
     * Redraw a cluster.
     * @private
     * @param{Boolean} isForce If redraw by force, no matter if the cluster is
     *     in viewport.
     */
    this.redraw = function(isForce) {
        if (!isForce && !this.isInBounds()) {
            return;
        }
    
        // Set cluster zoom level.
        zoom = map.getZoom();
        
        var maxZoom = placemarkClusterer.getMaxZoom();
        if (maxZoom === null) {
            maxZoom = map.getMaxZoom();
        }
        
        if (zoom >= maxZoom || this.getTotalPlacemarks() === 1) {
            // If current zoom level is beyond the max zoom level or the cluster
            // have only one placemark, the placemark(s) in cluster will be showed on map.
            $.each(placemarks, function (index, placemark) {
                if (placemark.added) {
                    if (placemark.placemark.isHidden()) {
                        placemark.placemark.show();
                    }
                } else {
                    map.addOverlay(placemark.placemark);
                    placemark.added = true;
                }
            });
      
            if (clusterPlacemark !== null) {
                clusterPlacemark.hide();
            }
        } else{
            // Else add a cluster placemark on map to show the number of placemarks in
            // this cluster.
            $.each(placemarks, function (index, placemark) {
                if (placemark.added && (!placemark.placemark.isHidden())) {
                    placemark.placemark.hide();
                }
                if (!placemark.added && placemark.placemark.isHidden()) {
                    placemark.placemark.show();
                }
            });
            
            if (clusterPlacemark === null) {
                clusterPlacemark = new YMaps.ClusterPlacemark(center, this.getTotalPlacemarks(), placemarkClusterer.getStyle(), placemarkClusterer.getGridSize());
                map.addOverlay(clusterPlacemark);
            } else{
                clusterPlacemark.setCount(this.getTotalPlacemarks());
                if (clusterPlacemark.isHidden()) {
                    clusterPlacemark.show();
                }
                clusterPlacemark.onMapUpdate();
            }
        }
    };

    /**
     * Remove all the placemarks from this cluster.
     */
    this.clearPlacemarks = function() {
        if (clusterPlacemark !== null) {
            map.removeOverlay(clusterPlacemark);
        }

        while (placemark = placemarks.pop()) {
            if (placemark.added) {
                map.removeOverlay(placemark.placemark);
            } 
        }
    };
}

YMaps.ClusterPlacemark = function(point, count, style, padding) {
    var self = this;
    
    var $ = YMaps.jQuery;
    
    this.placemark = new YMaps.Placemark(point, style);
    
    this.onAddToMap = function(map, parentContainer) {
        self.setCount(count);
        
        YMaps.Events.observe(self.placemark, self.placemark.Events.Click, function () {
            var pos = map.converter.coordinatesToMapPixels(point);
          
            var sw = new YMaps.Point(pos.x - padding, pos.y + padding);
            sw = map.converter.mapPixelsToCoordinates(sw);
          
            var ne = new YMaps.Point(pos.x + padding, pos.y - padding);
            ne = map.converter.mapPixelsToCoordinates(ne);
           
            map.setBounds(new YMaps.GeoBounds(sw, ne));
            return false;
        });

        map.addOverlay(self.placemark);
    };
    
    this.setCount = function(count) {
        self.placemark.setIconContent(count);
    };
    
    var methods = ["onMapUpdate", "onRemoveFromMap", "show", "hide", "isHidden"];
    $.map(methods, function (method) {
        self[method] = function() {
            return self.placemark[method].apply(self.placemark, arguments);
        };
    });
};

YMaps.Placemark.prototype.show = function() {
    if (this._$iconContainer) { // dirty hacking...
        this._$iconContainer.css("display", "");
    }
};

YMaps.Placemark.prototype.hide = function() {
    if (this._$iconContainer) { // dirty hacking...
        this._$iconContainer.css("display", "none");
    }
};

YMaps.Placemark.prototype.isHidden = function() {
    if (this._$iconContainer) {
        return this._$iconContainer.css("display") == "none";
    } else{
        return true;
    }
};